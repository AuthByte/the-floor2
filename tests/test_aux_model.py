"""Tests for auxiliary helper-model selection (src.utils.aux_model)."""

import importlib

import pytest

from src.llm.models import ModelProvider
from src.utils.aux_model import resolve_aux_model

OR = ModelProvider.OPENROUTER.value
DEFAULT = "nvidia/nemotron-3-super-120b-a12b:free"


def _state(model_name=None, provider=None, api_keys=None):
    request = None
    if api_keys is not None:
        request = type("Req", (), {"api_keys": api_keys})()
    return {
        "metadata": {
            "model_name": model_name,
            "model_provider": provider,
            "request": request,
        }
    }


@pytest.fixture(autouse=True)
def _clear_openrouter_env(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)


def test_falls_back_to_run_provider_without_openrouter_key():
    model, provider = resolve_aux_model(_state("llama3.2:3b", "Ollama"), DEFAULT)
    assert (model, provider) == ("llama3.2:3b", "Ollama")


def test_keeps_default_when_run_provider_is_openrouter():
    model, provider = resolve_aux_model(_state("anything", OR), DEFAULT)
    assert (model, provider) == (DEFAULT, OR)


def test_keeps_default_when_openrouter_key_present_in_request():
    state = _state("llama3.2:3b", "Ollama", api_keys={"OPENROUTER_API_KEY": "sk-or-real"})
    model, provider = resolve_aux_model(state, DEFAULT)
    assert (model, provider) == (DEFAULT, OR)


def test_placeholder_openrouter_key_is_ignored():
    state = _state("llama3.2:3b", "Ollama", api_keys={"OPENROUTER_API_KEY": "your-openrouter-api-key"})
    model, provider = resolve_aux_model(state, DEFAULT)
    assert (model, provider) == ("llama3.2:3b", "Ollama")


def test_env_openrouter_key_keeps_default(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-fromenv")
    model, provider = resolve_aux_model(_state("llama3.2:3b", "Ollama"), DEFAULT)
    assert (model, provider) == (DEFAULT, OR)


def test_handles_missing_metadata_gracefully():
    model, provider = resolve_aux_model({}, DEFAULT)
    assert (model, provider) == (DEFAULT, OR)
    model, provider = resolve_aux_model(None, DEFAULT)
    assert (model, provider) == (DEFAULT, OR)


def test_non_openrouter_default_is_returned_unchanged():
    model, provider = resolve_aux_model(_state("x", "Ollama"), "some-model", "Anthropic")
    assert (model, provider) == ("some-model", "Anthropic")
