from pathlib import Path

from fp_multimodel.mfa import (
    ACOUSTIC_MODEL,
    DICTIONARY_MODEL,
    align_corpus,
    download_mandarin_models,
)


def test_downloads_required_mandarin_models() -> None:
    commands: list[list[str]] = []

    def record(command: list[str], *, check: bool) -> None:
        assert check is True
        commands.append(command)

    download_mandarin_models(runner=record)

    assert commands == [
        ["mfa", "model", "download", "acoustic", ACOUSTIC_MODEL],
        ["mfa", "model", "download", "dictionary", DICTIONARY_MODEL],
    ]


def test_aligns_with_required_models(tmp_path: Path) -> None:
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    commands: list[list[str]] = []

    def record(command: list[str], *, check: bool) -> None:
        assert check is True
        commands.append(command)

    align_corpus(corpus, tmp_path / "aligned", clean=True, runner=record)

    assert commands[0][0:2] == ["mfa", "align"]
    assert commands[0][3:5] == [DICTIONARY_MODEL, ACOUSTIC_MODEL]
    assert commands[0][-1] == "--clean"
