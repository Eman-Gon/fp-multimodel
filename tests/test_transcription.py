from pathlib import Path

from fp_multimodel.transcription import AsrSegment, create_draft_transcript


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
