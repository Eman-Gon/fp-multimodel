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

CANDIDATE_TEXTGRID = """File type = "ooTextFile"
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
        intervals: size = 5
        intervals [1]:
            xmin = 0
            xmax = 1.1
            text = "你"
        intervals [2]:
            xmin = 1.1
            xmax = 1.5
            text = "了"
        intervals [3]:
            xmin = 1.5
            xmax = 1.9
            text = "吗"
        intervals [4]:
            xmin = 1.9
            xmax = 2.2
            text = "吧"
        intervals [5]:
            xmin = 2.2
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
            duration_ms=20_000,
            fps=30,
            transcript_sha256=transcript_sha256(reviewed),
            source_audio_sha256="b" * 64,
            normalized_video_sha256="c" * 64,
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
    assert result.schema_version == 1
    assert result.provenance is not None
    assert result.provenance.duration_ms == 20_000
    assert result.provenance.fps == 30
    assert result.provenance.transcript_sha256 == transcript_sha256(reviewed)
    assert result.provenance.dictionary_model == "mandarin_china_mfa"
    assert result.provenance.acoustic_model == "mandarin_mfa"


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


def test_detection_preserves_longest_candidate_and_traditional_surface(
    tmp_path: Path,
) -> None:
    speaker_dir = tmp_path / "spkA"
    speaker_dir.mkdir()
    (speaker_dir / "u1.TextGrid").write_text(
        CANDIDATE_TEXTGRID,
        encoding="utf-8",
    )
    reviewed = Transcript(
        video_id="vid1",
        utterances=[
            Utterance(
                id="u1",
                start_ms=12_400,
                end_ms=15_100,
                text="你了嗎吧",
                speaker="spkA",
                confidence=0.8,
                transcript_confirmed=True,
            )
        ],
    )
    write_alignment_manifest(tmp_path, reviewed)

    result = detect_from_mfa_output(reviewed, tmp_path)

    assert result.particles == []
    assert len(result.candidates) == 1
    candidate = result.candidates[0]
    assert candidate.instance_id == "vid1:u1"
    assert candidate.normalized_candidate == "了吗吧"
    assert candidate.surface_form == "了嗎吧"
    assert candidate.start_ms == 13_500
    assert candidate.end_ms == 14_600


def test_detection_surfaces_alignment_omission_for_confirmed_particle(
    tmp_path: Path,
) -> None:
    speaker_dir = tmp_path / "spkA"
    speaker_dir.mkdir()
    mismatched_textgrid = TEXTGRID.replace('text = "吗"', 'text = "<unk>"')
    (speaker_dir / "u1.TextGrid").write_text(
        mismatched_textgrid,
        encoding="utf-8",
    )
    reviewed = transcript()
    write_alignment_manifest(tmp_path, reviewed)

    with pytest.raises(ValueError, match="did not detect confirmed transcript particle"):
        detect_from_mfa_output(reviewed, tmp_path)


def test_detection_rejects_silent_reduction_of_confirmed_candidate(
    tmp_path: Path,
) -> None:
    speaker_dir = tmp_path / "spkA"
    speaker_dir.mkdir()
    reduced_textgrid = TEXTGRID.replace('text = "吗"', 'text = "吧"')
    (speaker_dir / "u1.TextGrid").write_text(
        reduced_textgrid,
        encoding="utf-8",
    )
    reviewed = Transcript(
        video_id="vid1",
        utterances=[
            Utterance(
                id="u1",
                start_ms=12_400,
                end_ms=15_100,
                text="你了吗吧",
                speaker="spkA",
                confidence=0.8,
                transcript_confirmed=True,
            )
        ],
    )
    write_alignment_manifest(tmp_path, reviewed)

    with pytest.raises(
        ValueError,
        match="did not detect confirmed transcript candidate '了吗吧'",
    ):
        detect_from_mfa_output(reviewed, tmp_path)
