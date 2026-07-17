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
        "output": "PartitionedCall/Identity",
        "classes_metadata": "discogs-maest-30s-pw-519l-2.json",
    },
}


AUDIO_DIM_HEADS = {
    "mood_happy": {
        "type": "binary",
        "graph": "mood_happy-discogs-effnet-1.pb",
        "metadata": "mood_happy-discogs-effnet-1.json",
        "label_cn": "快乐",
        "label_en": "Happy",
    },
    "mood_sad": {
        "type": "binary",
        "graph": "mood_sad-discogs-effnet-1.pb",
        "metadata": "mood_sad-discogs-effnet-1.json",
        "label_cn": "悲伤",
        "label_en": "Sad",
    },
    "mood_aggressive": {
        "type": "binary",
        "graph": "mood_aggressive-discogs-effnet-1.pb",
        "metadata": "mood_aggressive-discogs-effnet-1.json",
        "label_cn": "激进",
        "label_en": "Aggressive",
    },
    "mood_relaxed": {
        "type": "binary",
        "graph": "mood_relaxed-discogs-effnet-1.pb",
        "metadata": "mood_relaxed-discogs-effnet-1.json",
        "label_cn": "放松",
        "label_en": "Relaxed",
    },
    "mood_party": {
        "type": "binary",
        "graph": "mood_party-discogs-effnet-1.pb",
        "metadata": "mood_party-discogs-effnet-1.json",
        "label_cn": "派对",
        "label_en": "Party",
    },
    "mtg_jamendo_instrument": {
        "type": "multilabel",
        "graph": "mtg_jamendo_instrument-discogs-effnet-1.pb",
        "metadata": "mtg_jamendo_instrument-discogs-effnet-1.json",
        "label": "MTG Jamendo Instruments",
    },
    "mtg_jamendo_moodtheme": {
        "type": "multilabel",
        "graph": "mtg_jamendo_moodtheme-discogs-effnet-1.pb",
        "metadata": "mtg_jamendo_moodtheme-discogs-effnet-1.json",
        "label": "MTG Jamendo Mood/Theme",
    },
}


MOOD_RADAR_ORDER = ["mood_happy", "mood_party", "mood_aggressive", "mood_sad", "mood_relaxed"]


def resolve_model(name):
    if name not in MODEL_REGISTRY:
        raise SystemExit(
            f"Unknown genre model '{name}'. Available: {', '.join(MODEL_REGISTRY)}"
        )
    return MODEL_REGISTRY[name]


def resolve_head(name):
    if name not in AUDIO_DIM_HEADS:
        raise SystemExit(
            f"Unknown dimension head '{name}'. Available: {', '.join(AUDIO_DIM_HEADS)}"
        )
    return AUDIO_DIM_HEADS[name]


_MODEL_CACHE = {}
_METADATA_CACHE = {}


def load_metadata(metadata_path):
    key = str(metadata_path)
    cached = _METADATA_CACHE.get(key)
    if cached is None:
        with metadata_path.open("r", encoding="utf-8") as f:
            cached = json.load(f)
        _METADATA_CACHE[key] = cached
    return cached


def summarize_predictions(predictions):
    values = np.asarray(predictions)
    if values.ndim > 1:
        return values.reshape(values.shape[0], -1).mean(axis=0)
    return values.reshape(-1)


def get_effnet_embedding_model():
    key = ("effnet_embed",)
    cached = _MODEL_CACHE.get(key)
    if cached is None:
        cached = TensorflowPredictEffnetDiscogs(
            graphFilename=str(MODELS / "discogs-effnet-bs64-1.pb"),
            output="PartitionedCall:1",
        )
        _MODEL_CACHE[key] = cached
    return cached


def _resolve_io_names(config):
    metadata = load_metadata(MODELS / config["metadata"])
    schema = metadata.get("schema", {})
    inputs = schema.get("inputs", [])
    outputs = schema.get("outputs", [])
    input_name = inputs[0]["name"] if inputs else "model/Placeholder"
    pred_output = None
    for out in outputs:
        if out.get("output_purpose") == "predictions":
            pred_output = out["name"]
            break
    if pred_output is None and outputs:
        pred_output = outputs[0]["name"]
    output_name = pred_output or "model/Sigmoid"
    return input_name, output_name


def get_classifier_head(head_name):
    config = resolve_head(head_name)
    key = ("head", head_name)
    cached = _MODEL_CACHE.get(key)
    if cached is None:
        graph_path = MODELS / config["graph"]
        if not graph_path.exists() or graph_path.stat().st_size < 10000:
            return None
        input_name, output_name = _resolve_io_names(config)
        try:
            cached = TensorflowPredict2D(
                graphFilename=str(graph_path),
                input=input_name,
                output=output_name,
            )
        except Exception as e:
            sys.stderr.write(f"Warning: failed to load dimension head '{head_name}': {e}\n")
            sys.stderr.flush()
            return None
        _MODEL_CACHE[key] = cached
    return cached


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-float(x)))


def build_dim_result(dim_name, config, values):
    result = {}
    if config["type"] == "binary":
        flat = values.flatten()
        if flat.size >= 2:
            score = float(flat[1])
        else:
            raw = float(flat[0])
            score = sigmoid(raw) if (raw < 0.0 or raw > 1.0) else raw
        score = max(0.0, min(1.0, score))
        result[dim_name] = {
            "type": "binary",
            "label_cn": config["label_cn"],
            "label_en": config["label_en"],
            "score": round(score, 4),
        }
    elif config["type"] == "multilabel":
        metadata = load_metadata(MODELS / config["metadata"])
        classes = metadata.get("classes", metadata.get("outputs", [{}])[0].get("classes", []))
        if isinstance(classes, list) and len(classes) > 0 and isinstance(classes[0], dict):
            classes = [c.get("name", str(c)) for c in classes]
        scores = [float(v) for v in values.flatten()]
        if len(classes) != len(scores):
            classes = [f"class_{i}" for i in range(len(scores))]
        pairs = sorted(zip(classes, scores), key=lambda x: x[1], reverse=True)
        result[dim_name] = {
            "type": "multilabel",
            "predictions": [
                {"label": label, "score": round(score, 4)}
                for label, score in pairs[:10]
            ],
        }
    return result


def run_effnet_dimensions(audio, dims):
    embedding_model = get_effnet_embedding_model()
    embeddings = embedding_model(audio)

    result = {}
    for dim_name in dims:
        dim_config = resolve_head(dim_name)
        head = get_classifier_head(dim_name)
        if head is None:
            continue
        raw = head(embeddings)
        values = summarize_predictions(raw)
        result.update(build_dim_result(dim_name, dim_config, values))

    if all(k in result for k in MOOD_RADAR_ORDER):
        radar_axes = []
        for mood_key in MOOD_RADAR_ORDER:
            m = result[mood_key]
            radar_axes.append({
                "key": mood_key,
                "label_cn": m["label_cn"],
                "label_en": m["label_en"],
                "score": m["score"],
            })
        result["mood_radar"] = {
            "type": "radar",
            "axes": radar_axes,
        }

    return result


def analyze_maest(audio, config):
    output_node = os.environ.get("MAEST_OUTPUT_NODE", config["output"]).strip()
    model = TensorflowPredictMAEST(
        graphFilename=str(MODELS / config["graph"]),
        output=output_node,
    )
    scores = summarize_predictions(model(audio))
    if scores.size and (scores.min() < 0.0 or scores.max() > 1.0):
        scores = 1.0 / (1.0 + np.exp(-scores))
    return scores


def _effnet_genre_classifier(config):
    key = ("effnet_genre_cls", config["classifier_graph"])
    cached = _MODEL_CACHE.get(key)
    if cached is None:
        cached = TensorflowPredict2D(
            graphFilename=str(MODELS / config["classifier_graph"]),
            input=config["classifier_input"],
            output=config["classifier_output"],
        )
        _MODEL_CACHE[key] = cached
    return cached


def build_genre_payload(config, classes, scores, top_n):
    ranked = sorted(zip(classes, scores), key=lambda item: float(item[1]), reverse=True)
    return {
        "model": config["label"],
        "modelKey": None,
        "predictions": [
            {"label": label, "score": round(float(score), 4)}
            for label, score in ranked[:top_n]
        ],
    }


def analyze(audio_path, top_n, model_name, include_dims=False):
    audio = MonoLoader(filename=str(audio_path), sampleRate=16000, resampleQuality=4)()

    if model_name == "effnet400":
        embedding_model = get_effnet_embedding_model()
        embeddings = embedding_model(audio)
        genre_config = resolve_model(model_name)
        classifier = _effnet_genre_classifier(genre_config)
        genre_scores = summarize_predictions(classifier(embeddings))

        genre_metadata = load_metadata(MODELS / genre_config["classes_metadata"])
        genre_classes = genre_metadata.get("classes", genre_metadata.get("outputs", [{}])[0].get("classes", []))
        if isinstance(genre_classes, list) and len(genre_classes) > 0 and isinstance(genre_classes[0], dict):
            genre_classes = [c.get("name", str(c)) for c in genre_classes]
        genre_config_resolved = genre_config

        dimensions = {}
        if include_dims:
            for dim_name in AUDIO_DIM_HEADS:
                dim_config = resolve_head(dim_name)
                head = get_classifier_head(dim_name)
                if head is None:
                    continue
                raw = head(embeddings)
                values = summarize_predictions(raw)
                dimensions.update(build_dim_result(dim_name, dim_config, values))
            if all(k in dimensions for k in MOOD_RADAR_ORDER):
                radar_axes = []
                for mood_key in MOOD_RADAR_ORDER:
                    m = dimensions[mood_key]
                    radar_axes.append({
                        "key": mood_key,
                        "label_cn": m["label_cn"],
                        "label_en": m["label_en"],
                        "score": m["score"],
                    })
                dimensions["mood_radar"] = {"type": "radar", "axes": radar_axes}
    else:
        scores = analyze_maest(audio, resolve_model(model_name))
        genre_config = resolve_model(model_name)
        genre_metadata = load_metadata(MODELS / genre_config["classes_metadata"])
        genre_classes = genre_metadata.get("classes", genre_metadata.get("outputs", [{}])[0].get("classes", []))
        if isinstance(genre_classes, list) and len(genre_classes) > 0 and isinstance(genre_classes[0], dict):
            genre_classes = [c.get("name", str(c)) for c in genre_classes]
        genre_scores = scores
        genre_config_resolved = genre_config

        dimensions = {}
        if include_dims:
            dimensions = run_effnet_dimensions(audio, list(AUDIO_DIM_HEADS.keys()))

    if len(genre_classes) != len(genre_scores):
        raise SystemExit(
            f"Model '{model_name}' returned {len(genre_scores)} scores but metadata "
            f"has {len(genre_classes)} classes."
        )

    genre_payload = build_genre_payload(genre_config_resolved, genre_classes, genre_scores, top_n)
    return genre_config_resolved, genre_payload, dimensions


def build_payload(audio_path, top_n, model_name, include_dims=False):
    config, genre_payload, dimensions = analyze(audio_path, top_n, model_name, include_dims=include_dims)
    genre_payload["audio"] = str(audio_path)
    genre_payload["modelKey"] = model_name
    if include_dims:
        genre_payload["dimensions"] = dimensions
    return genre_payload


def serve_loop():
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
            include_dims = bool(req.get("includeDimensions", req.get("dimensions", False)))
            payload = build_payload(audio_path, top_n, model_name, include_dims=include_dims)
            response = {"id": req_id, "ok": True, "result": payload}
        except Exception as error:
            response = {
                "id": req_id,
                "ok": False,
                "error": str(error) or error.__class__.__name__,
            }
            sys.stderr.write(traceback.format_exc())
            sys.stderr.flush()
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        gc.collect()


def main():
    parser = argparse.ArgumentParser(description="Analyze music with Essentia models (genre + audio dimensions).")
    parser.add_argument("audio", type=Path, nargs="?", help="Audio file path, e.g. mp3/wav/flac.")
    parser.add_argument("--top", type=int, default=12, help="Number of genre labels to show.")
    parser.add_argument(
        "--model",
        default=os.environ.get("GENRE_MODEL", "effnet400"),
        choices=list(MODEL_REGISTRY),
        help="Genre model to run.",
    )
    parser.add_argument("--dims", action="store_true", help="Include audio dimensions (mood, instruments).")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    parser.add_argument(
        "--serve",
        action="store_true",
        help="Run as a long-lived worker.",
    )
    args = parser.parse_args()

    if args.serve:
        serve_loop()
        return

    if args.audio is None:
        parser.error("audio is required unless --serve is used")

    if not args.audio.exists():
        raise SystemExit(f"Audio file not found: {args.audio}")

    payload = build_payload(args.audio, args.top, args.model, include_dims=args.dims)
    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
        return

    print(f"Audio: {payload['audio']}")
    print(f"Model: {payload['model']}")
    print("Top genre/style predictions:")
    for item in payload["predictions"]:
        print(f"  {item['score']:0.4f}  {item['label']}")

    if args.dims and payload.get("dimensions"):
        dims = payload["dimensions"]
        radar = dims.get("mood_radar")
        if radar:
            print(f"\nMood profile:")
            for ax in radar["axes"]:
                print(f"  {ax['score']:0.4f}  {ax['label_cn']} ({ax['label_en']})")
        inst = dims.get("mtg_jamendo_instrument")
        if inst:
            print(f"\nInstruments:")
            for item in inst["predictions"]:
                print(f"  {item['score']:0.4f}  {item['label']}")


if __name__ == "__main__":
    main()
