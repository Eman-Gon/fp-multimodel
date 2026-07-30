from pathlib import Path

import pytest

from fp_multimodel.manifest import TrackAManifest, transcript_sha256, write_manifest
from fp_multimodel.models import Transcript, Utterance
from fp_multimodel.pipeline import detect_from_mfa_output


TEXTGRID = """File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 2.7
tiers? <exists>
size = 1
item []:
    item [1]:
        class = "IntervalTier"
        name = "words"
        xmin = 0
        xmax = 2.7
        intervals: size = 3
        intervals [1]:
            xmin = 0
            xmax = 1.5
            text = "你"
        intervals [2]:
            xmin = 1.5
            xmax = 2.08
            text = "吗"
        intervals [3]:
            xmin = 2.08
            xmax = 2.7
            text = ""
"""


def transcript(*, confirmed: bool = True) -> Transcript:
    return Transcript(
        video_id="vid1",
        utterances=[
            Utterance(
                id="u1",
                start_ms=12_400,
                end_ms=15_100,
                text="你嗎",
                speaker="spkA",
                confidence=0.8,
                transcript_confirmed=confirmed,
            )
        ],
    )


def write_alignment_manifest(path: Path, reviewed: Transcript) -> None:
    write_manifest(
        path,
        TrackAManifest(
            stage="alignment",
            video_id=reviewed.video_id,
            transcript_sha256=transcript_sha256(reviewed),
            source_audio_sha256="b" * 64,
            dictionary_model="mandarin_china_mfa",
            acoustic_model="mandarin_mfa",
        ),
    )


def test_detection_offsets_segment_times_to_source_timeline(tmp_path: Path) -> None:
    speaker_dir = tmp_path / "spkA"
    speaker_dir.mkdir()
    (speaker_dir / "u1.TextGrid").write_text(TEXTGRID, encoding="utf-8")
    reviewed = transcript()
    write_alignment_manifest(tmp_path, reviewed)

    result = detect_from_mfa_output(reviewed, tmp_path)

    assert len(result.particles) == 1
    particle = result.particles[0]
    assert particle.instance_id == "vid1:u1"
    assert particle.surface_form == "嗎"
    assert particle.fp_token == "吗"
    assert particle.fp_start_ms == 13_900
    assert particle.fp_end_ms == 14_480


def test_detection_refuses_unconfirmed_transcript(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="human-confirmed transcript"):
        detect_from_mfa_output(transcript(confirmed=False), tmp_path)


def test_detection_rejects_stale_transcript_revision(tmp_path: Path) -> None:
    original = transcript()
    write_alignment_manifest(tmp_path, original)
    changed = Transcript(
        video_id="vid1",
        utterances=[
            Utterance(
                id="u1",
                start_ms=12_400,
                end_ms=15_100,
                text="你吧",
                speaker="spkA",
                confidence=0.8,
                transcript_confirmed=True,
            )
        ],
    )

    with pytest.raises(ValueError, match="different transcript revision"):
        detect_from_mfa_output(changed, tmp_path)
