import pytest
from pydantic import ValidationError

from fp_multimodel.models import Transcript, Utterance


def test_utterance_requires_forward_time_range() -> None:
    with pytest.raises(ValidationError, match="end_ms must be greater"):
        Utterance(
            id="u1",
            start_ms=1000,
            end_ms=1000,
            text="你好吗",
            speaker="spkA",
            confidence=0.8,
        )


def test_transcript_rejects_duplicate_utterance_ids() -> None:
    utterance = Utterance(
        id="u1",
        start_ms=1000,
        end_ms=2000,
        text="你好吗",
        speaker="spkA",
        confidence=0.8,
    )
    with pytest.raises(ValidationError, match="utterance ids must be unique"):
        Transcript(video_id="vid1", utterances=[utterance, utterance])


def test_confidence_is_bounded() -> None:
    with pytest.raises(ValidationError):
        Utterance(
            id="u1",
            start_ms=1000,
            end_ms=2000,
            text="你好吗",
            speaker="spkA",
            confidence=1.1,
        )

