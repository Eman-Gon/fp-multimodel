from pathlib import Path

from fp_multimodel.transcription import (
    AsrSegment,
    create_draft_transcript,
    create_draft_transcript_batch,
)


class FakeMandarinAsr:
    def transcribe(self, audio: Path) -> list[AsrSegment]:
        assert audio.name == "audio.wav"
        return [
            AsrSegment(
                id="u1",
                start_ms=12_400,
                end_ms=15_100,
                text="你吃飯了嗎",
                speaker="spkA",
                confidence=0.82,
            )
        ]


def test_provider_output_is_always_an_unconfirmed_normalized_draft(
    tmp_path: Path,
) -> None:
    audio = tmp_path / "audio.wav"
    audio.touch()

    transcript = create_draft_transcript("vid1", audio, FakeMandarinAsr())

    utterance = transcript.utterances[0]
    assert utterance.text == "你吃飯了吗"
    assert utterance.surface_text == "你吃飯了嗎"
    assert utterance.transcript_confirmed is False


def test_multiple_videos_remain_separate_in_a_draft_batch(tmp_path: Path) -> None:
    first_audio = tmp_path / "first" / "audio.wav"
    second_audio = tmp_path / "second" / "audio.wav"
    first_audio.parent.mkdir()
    second_audio.parent.mkdir()
    first_audio.touch()
    second_audio.touch()

    batch = create_draft_transcript_batch(
        "project-1",
        [("vid1", first_audio), ("vid2", second_audio)],
        FakeMandarinAsr(),
    )

    assert [item.video_id for item in batch.transcripts] == ["vid1", "vid2"]
    assert all(item.utterances[0].start_ms == 12_400 for item in batch.transcripts)
