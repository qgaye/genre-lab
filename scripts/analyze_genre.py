#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np
from essentia.standard import MonoLoader, TensorflowPredict2D, TensorflowPredictEffnetDiscogs


ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"


def load_classes(metadata_path):
    with metadata_path.open("r", encoding="utf-8") as f:
        metadata = json.load(f)
    return metadata["classes"]


def summarize_predictions(predictions):
    values = np.asarray(predictions)
    if values.ndim == 2:
        return values.mean(axis=0)
    return values.reshape(-1)


def analyze(audio_path, top_n):
    audio = MonoLoader(filename=str(audio_path), sampleRate=16000, resampleQuality=4)()

    embedding_model = TensorflowPredictEffnetDiscogs(
        graphFilename=str(MODELS / "discogs-effnet-bs64-1.pb"),
        output="PartitionedCall:1",
    )
    embeddings = embedding_model(audio)

    classifier = TensorflowPredict2D(
        graphFilename=str(MODELS / "genre_discogs400-discogs-effnet-1.pb"),
        input="serving_default_model_Placeholder",
        output="PartitionedCall:0",
    )
    scores = summarize_predictions(classifier(embeddings))
    classes = load_classes(MODELS / "genre_discogs400-discogs-effnet-1.json")

    ranked = sorted(zip(classes, scores), key=lambda item: float(item[1]), reverse=True)
    return [(label, float(score)) for label, score in ranked[:top_n]]


def main():
    parser = argparse.ArgumentParser(description="Analyze music genre/style tags with Essentia Discogs400.")
    parser.add_argument("audio", type=Path, help="Audio file path, e.g. mp3/wav/flac.")
    parser.add_argument("--top", type=int, default=12, help="Number of labels to show.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args()

    if not args.audio.exists():
        raise SystemExit(f"Audio file not found: {args.audio}")

    predictions = analyze(args.audio, args.top)
    if args.json:
        print(json.dumps({
            "audio": str(args.audio),
            "model": "Essentia Discogs-EffNet + Discogs400",
            "predictions": [
                {"label": label, "score": score}
                for label, score in predictions
            ]
        }, ensure_ascii=False))
        return

    print(f"Audio: {args.audio}")
    print("Top genre/style predictions:")
    for label, score in predictions:
        print(f"{score:0.4f}  {label}")


if __name__ == "__main__":
    main()
