"""Command-line entry point for the first Track A vertical slice."""

from __future__ import annotations

import argparse
import subprocess
from collections.abc import Sequence
from pathlib import Path

from fp_multimodel.corpus import prepare_mfa_corpus
from fp_multimodel.jsonio import load_transcript, load_transcript_batch, write_model
from fp_multimodel.media import normalize_media
from fp_multimodel.mfa import align_corpus, download_mandarin_models
from fp_multimodel.pipeline import detect_from_mfa_output


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="fp-track-a",
        description=(
            "Track A: normalize media, prepare reviewed transcripts for MFA, "
            "align, and detect utterance-final particles."
        ),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser(
        "validate-transcript",
        help="validate a draft or reviewed transcript JSON file",
    )
    validate.add_argument("transcript", type=Path)

    validate_batch = subparsers.add_parser(
        "validate-transcript-batch",
        help="validate a project JSON file containing multiple video transcripts",
    )
    validate_batch.add_argument("batch", type=Path)

    normalize = subparsers.add_parser(
        "normalize",
        help="normalize a video to 30 fps and extract 16 kHz mono audio",
    )
    normalize.add_argument("input_video", type=Path)
    normalize.add_argument("--output-dir", type=Path, required=True)
    normalize.add_argument("--force", action="store_true")
    normalize.add_argument("--ffmpeg-bin", default="ffmpeg")

    corpus = subparsers.add_parser(
        "prepare-corpus",
        help="split audio and write MFA labels from a confirmed transcript",
    )
    corpus.add_argument("transcript", type=Path)
    corpus.add_argument("audio", type=Path)
    corpus.add_argument("--output-dir", type=Path, required=True)
    corpus.add_argument("--force", action="store_true")
    corpus.add_argument("--ffmpeg-bin", default="ffmpeg")

    models = subparsers.add_parser(
        "download-mfa-models",
        help="download the Mandarin MFA dictionary and acoustic model",
    )
    models.add_argument("--mfa-bin", default="mfa")

    align = subparsers.add_parser(
        "align",
        help="run Montreal Forced Aligner over a prepared corpus",
    )
    align.add_argument("corpus_dir", type=Path)
    align.add_argument("--output-dir", type=Path, required=True)
    align.add_argument("--clean", action="store_true")
    align.add_argument("--mfa-bin", default="mfa")

    detect = subparsers.add_parser(
        "detect-fps",
        help="parse MFA TextGrids and detect utterance-final target particles",
    )
    detect.add_argument("transcript", type=Path)
    detect.add_argument("alignment_dir", type=Path)
    detect.add_argument("--output", type=Path, required=True)
    detect.add_argument("--tier-name")
    detect.add_argument("--force", action="store_true")

    return parser


def _dispatch(args: argparse.Namespace) -> None:
    if args.command == "validate-transcript":
        transcript = load_transcript(args.transcript)
        confirmed = sum(
            utterance.transcript_confirmed for utterance in transcript.utterances
        )
        print(
            f"valid transcript: {transcript.video_id} "
            f"({confirmed}/{len(transcript.utterances)} utterances confirmed)"
        )
        return

    if args.command == "validate-transcript-batch":
        batch = load_transcript_batch(args.batch)
        utterance_count = sum(
            len(transcript.utterances) for transcript in batch.transcripts
        )
        print(
            f"valid transcript batch: {batch.project_id} "
            f"({len(batch.transcripts)} videos, {utterance_count} utterances)"
        )
        return

    if args.command == "normalize":
        outputs = normalize_media(
            args.input_video,
            args.output_dir,
            overwrite=args.force,
            ffmpeg_bin=args.ffmpeg_bin,
        )
        print(f"normalized video: {outputs.video}")
        print(f"16 kHz mono audio: {outputs.audio}")
        return

    if args.command == "prepare-corpus":
        entries = prepare_mfa_corpus(
            load_transcript(args.transcript),
            args.audio,
            args.output_dir,
            overwrite=args.force,
            ffmpeg_bin=args.ffmpeg_bin,
        )
        print(f"prepared {len(entries)} reviewed utterances in {args.output_dir}")
        return

    if args.command == "download-mfa-models":
        download_mandarin_models(mfa_bin=args.mfa_bin)
        print("downloaded mandarin_china_mfa and mandarin_mfa")
        return

    if args.command == "align":
        align_corpus(
            args.corpus_dir,
            args.output_dir,
            clean=args.clean,
            mfa_bin=args.mfa_bin,
        )
        print(f"alignment output: {args.output_dir}")
        return

    if args.command == "detect-fps":
        result = detect_from_mfa_output(
            load_transcript(args.transcript),
            args.alignment_dir,
            tier_name=args.tier_name,
        )
        write_model(args.output, result, overwrite=args.force)
        print(f"detected {len(result.particles)} final particles: {args.output}")
        return

    raise AssertionError(f"unhandled command: {args.command}")


def main(argv: Sequence[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        _dispatch(args)
    except (
        FileExistsError,
        FileNotFoundError,
        OSError,
        subprocess.CalledProcessError,
        ValueError,
    ) as error:
        parser.exit(1, f"error: {error}\n")


if __name__ == "__main__":
    main()
