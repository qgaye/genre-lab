#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np
from essentia.standard import (
    MonoLoader,
    TensorflowPredict2D,
    TensorflowPredictEffnetDiscogs,
    TensorflowPredictMAEST,
)


ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"


# Model registry. Each entry is self-contained so the server can switch between
# genre models by name without any hardcoded class list: the label taxonomy is
# always read from the model's own metadata json.
#
# effnet400: two-stage pipeline (Discogs-EffNet embedding -> Discogs400 head).
# maest519 : single-stage MAEST transformer that outputs Discogs style logits.
MODEL_REGISTRY = {
    "effnet400": {
        "type": "effnet",
        "label": "Essentia Discogs400 - 400 styles, faster/coarser",
        "embedding_graph": "discogs-effnet-bs64-1.pb",
        "embedding_output": "PartitionedCall:1",
        "classifier_graph": "genre_discogs400-discogs-effnet-1.pb",
        "classifier_input": "serving_default_model_Placeholder",
        "classifier_output": "PartitionedCall:0",
        "classes_metadata": "genre_discogs400-discogs-effnet-1.json",
    },
    "maest519": {
        "type": "maest",
        "label": "Essentia MAEST - 519 styles, finer/slower",
        "graph": "discogs-maest-30s-pw-519l-2.pb",
        # Classification activations output node of the MAEST graph. The
        # embeddings node is "PartitionedCall/Identity_7"; the classification
        # head activations are exposed on a different node. This can be
        # overridden with MAEST_OUTPUT_NODE after inspecting the downloaded
        # model, without touching code.
        "output": "PartitionedCall/Identity",
        "classes_metadata": "discogs-maest-30s-pw-519l-2.json",
    },
}


def resolve_model(name):
    if name not in MODEL_REGISTRY:
        raise SystemExit(
            f"Unknown genre model '{name}'. Available: {', '.join(MODEL_REGISTRY)}"
        )
    return MODEL_REGISTRY[name]


def load_classes(metadata_path):
    with metadata_path.open("r", encoding="utf-8") as f:
        metadata = json.load(f)
    return metadata["classes"]


def summarize_predictions(predictions):
    values = np.asarray(predictions)
    # MAEST/EffNet return one row of activations per analyzed audio patch; the
    # whole track is summarized by averaging across all patches.
    if values.ndim > 1:
        return values.reshape(values.shape[0], -1).mean(axis=0)
    return values.reshape(-1)


def analyze_effnet(audio, config):
    embedding_model = TensorflowPredictEffnetDiscogs(
        graphFilename=str(MODELS / config["embedding_graph"]),
        output=config["embedding_output"],
    )
    embeddings = embedding_model(audio)

    classifier = TensorflowPredict2D(
        graphFilename=str(MODELS / config["classifier_graph"]),
        input=config["classifier_input"],
        output=config["classifier_output"],
    )
    return summarize_predictions(classifier(embeddings))


def analyze_maest(audio, config):
    output_node = os.environ.get("MAEST_OUTPUT_NODE", config["output"]).strip()
    model = TensorflowPredictMAEST(
        graphFilename=str(MODELS / config["graph"]),
        output=output_node,
    )
    scores = summarize_predictions(model(audio))
    # MAEST classification activations may come out as raw logits; map to a
    # 0..1 range with a sigmoid when the values fall outside that range.
    if scores.size and (scores.min() < 0.0 or scores.max() > 1.0):
        scores = 1.0 / (1.0 + np.exp(-scores))
    return scores


def analyze(audio_path, top_n, model_name):
    config = resolve_model(model_name)
    audio = MonoLoader(filename=str(audio_path), sampleRate=16000, resampleQuality=4)()

    if config["type"] == "maest":
        scores = analyze_maest(audio, config)
    else:
        scores = analyze_effnet(audio, config)

    classes = load_classes(MODELS / config["classes_metadata"])
    if len(classes) != len(scores):
        raise SystemExit(
            f"Model '{model_name}' returned {len(scores)} scores but metadata "
            f"has {len(classes)} classes. Check the model output node / metadata."
        )

    ranked = sorted(zip(classes, scores), key=lambda item: float(item[1]), reverse=True)
    return config, [(label, float(score)) for label, score in ranked[:top_n]]


def main():
    parser = argparse.ArgumentParser(description="Analyze music genre/style tags with Essentia Discogs models.")
    parser.add_argument("audio", type=Path, help="Audio file path, e.g. mp3/wav/flac.")
    parser.add_argument("--top", type=int, default=12, help="Number of labels to show.")
    parser.add_argument(
        "--model",
        default=os.environ.get("GENRE_MODEL", "effnet400"),
        choices=list(MODEL_REGISTRY),
        help="Genre model to run (default from GENRE_MODEL env or effnet400).",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args()

    if not args.audio.exists():
        raise SystemExit(f"Audio file not found: {args.audio}")

    config, predictions = analyze(args.audio, args.top, args.model)
    if args.json:
        print(json.dumps({
            "audio": str(args.audio),
            "model": config["label"],
            "modelKey": args.model,
            "predictions": [
                {"label": label, "score": score}
                for label, score in predictions
            ]
        }, ensure_ascii=False))
        return

    print(f"Audio: {args.audio}")
    print(f"Model: {config['label']}")
    print("Top genre/style predictions:")
    for label, score in predictions:
        print(f"{score:0.4f}  {label}")


if __name__ == "__main__":
    main()
