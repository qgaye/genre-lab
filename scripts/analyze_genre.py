#!/usr/bin/env python3
import argparse
import gc
import json
import os
import sys
import traceback
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


# Loading a TensorFlow graph and parsing the label taxonomy are the dominant
# per-analysis costs. In serve mode the same model is reused for every track, so
# both are built once and cached, keyed by model config / metadata file.
_MODEL_CACHE = {}
_CLASSES_CACHE = {}


def load_classes(metadata_path):
    # The label taxonomy never changes between tracks, so cache the parsed list
    # per metadata file instead of re-reading and re-parsing the JSON each call.
    key = str(metadata_path)
    cached = _CLASSES_CACHE.get(key)
    if cached is None:
        with metadata_path.open("r", encoding="utf-8") as f:
            metadata = json.load(f)
        cached = metadata["classes"]
        _CLASSES_CACHE[key] = cached
    return cached


def summarize_predictions(predictions):
    values = np.asarray(predictions)
    # MAEST/EffNet return one row of activations per analyzed audio patch; the
    # whole track is summarized by averaging across all patches.
    if values.ndim > 1:
        return values.reshape(values.shape[0], -1).mean(axis=0)
    return values.reshape(-1)


def analyze_effnet(audio, config):
    embedding_model, classifier = _effnet_models(config)
    embeddings = embedding_model(audio)
    return summarize_predictions(classifier(embeddings))


def analyze_maest(audio, config):
    model = _maest_model(config)
    scores = summarize_predictions(model(audio))
    # MAEST classification activations may come out as raw logits; map to a
    # 0..1 range with a sigmoid when the values fall outside that range.
    if scores.size and (scores.min() < 0.0 or scores.max() > 1.0):
        scores = 1.0 / (1.0 + np.exp(-scores))
    return scores


def _effnet_models(config):
    key = ("effnet", config["embedding_graph"], config["classifier_graph"])
    cached = _MODEL_CACHE.get(key)
    if cached is None:
        embedding_model = TensorflowPredictEffnetDiscogs(
            graphFilename=str(MODELS / config["embedding_graph"]),
            output=config["embedding_output"],
        )
        classifier = TensorflowPredict2D(
            graphFilename=str(MODELS / config["classifier_graph"]),
            input=config["classifier_input"],
            output=config["classifier_output"],
        )
        cached = (embedding_model, classifier)
        _MODEL_CACHE[key] = cached
    return cached


def _maest_model(config):
    # MAEST's TensorFlow model is huge (~4GB resident). Unlike effnet we do NOT
    # cache it: keeping it alive between requests would pin that memory for the
    # whole worker lifetime and OOM small hosts. Build it fresh each call so it
    # can be garbage-collected once the analysis returns.
    output_node = os.environ.get("MAEST_OUTPUT_NODE", config["output"]).strip()
    return TensorflowPredictMAEST(
        graphFilename=str(MODELS / config["graph"]),
        output=output_node,
    )


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


def build_payload(audio_path, top_n, model_name):
    config, predictions = analyze(audio_path, top_n, model_name)
    return {
        "audio": str(audio_path),
        "model": config["label"],
        "modelKey": model_name,
        "predictions": [
            {"label": label, "score": score}
            for label, score in predictions
        ],
    }


def serve_loop():
    # Long-lived worker mode: read one JSON request per line from stdin and emit
    # one JSON response per line on stdout. The heavy TensorFlow/model load is
    # paid once (lazily, on the first request) for effnet400 and reused for every
    # later track. maest519 is deliberately not cached (see _maest_model), so its
    # large model is rebuilt per request and freed afterwards.
    # Request : {"id": <any>, "audio": <path>, "top": <int>, "model": <name>}
    # Response: {"id": <any>, "ok": true, "result": {...}}
    #        or {"id": <any>, "ok": false, "error": "..."}
    sys.stdout.write(json.dumps({"ready": True}) + "\n")
    sys.stdout.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            audio_path = Path(req["audio"])
            if not audio_path.exists():
                raise ValueError(f"Audio file not found: {audio_path}")
            top_n = int(req.get("top", 12))
            model_name = req.get("model") or os.environ.get("GENRE_MODEL", "effnet400")
            payload = build_payload(audio_path, top_n, model_name)
            response = {"id": req_id, "ok": True, "result": payload}
        except Exception as error:  # noqa: BLE001 - report any failure per request
            response = {
                "id": req_id,
                "ok": False,
                "error": str(error) or error.__class__.__name__,
            }
            sys.stderr.write(traceback.format_exc())
            sys.stderr.flush()
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        # Reclaim the memory of any uncached model (maest519) before idling so the
        # worker doesn't sit on ~4GB between requests.
        gc.collect()


def main():
    parser = argparse.ArgumentParser(description="Analyze music genre/style tags with Essentia Discogs models.")
    parser.add_argument("audio", type=Path, nargs="?", help="Audio file path, e.g. mp3/wav/flac.")
    parser.add_argument("--top", type=int, default=12, help="Number of labels to show.")
    parser.add_argument(
        "--model",
        default=os.environ.get("GENRE_MODEL", "effnet400"),
        choices=list(MODEL_REGISTRY),
        help="Genre model to run (default from GENRE_MODEL env or effnet400).",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    parser.add_argument(
        "--serve",
        action="store_true",
        help="Run as a long-lived worker: read JSON requests from stdin, one per line.",
    )
    args = parser.parse_args()

    if args.serve:
        serve_loop()
        return

    if args.audio is None:
        parser.error("audio is required unless --serve is used")

    if not args.audio.exists():
        raise SystemExit(f"Audio file not found: {args.audio}")

    payload = build_payload(args.audio, args.top, args.model)
    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
        return

    print(f"Audio: {payload['audio']}")
    print(f"Model: {payload['model']}")
    print("Top genre/style predictions:")
    for item in payload["predictions"]:
        print(f"{item['score']:0.4f}  {item['label']}")


if __name__ == "__main__":
    main()
