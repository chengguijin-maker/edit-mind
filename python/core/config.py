"""Configuration management."""
from dataclasses import dataclass, field
from typing import Dict, Optional
import os


def _get_positive_int_env(key: str, default: int) -> int:
    raw_value = os.getenv(key)
    if raw_value is None:
        return default

    try:
        parsed_value = int(raw_value)
        return parsed_value if parsed_value > 0 else default
    except (TypeError, ValueError):
        return default


def _get_positive_float_env(key: str, default: float) -> float:
    raw_value = os.getenv(key)
    if raw_value is None:
        return default

    try:
        parsed_value = float(raw_value)
        return parsed_value if parsed_value > 0 else default
    except (TypeError, ValueError):
        return default


@dataclass
class AnalysisConfig:
    """Video analysis configuration."""
    sample_interval_seconds: float = field(
        default_factory=lambda: _get_positive_float_env(
            "ANALYSIS_SAMPLE_INTERVAL_SECONDS",
            5.0,
        )
    )
    max_workers: int = 2
    enable_streaming: bool = True
    enable_aggressive_gc: bool = False
    frame_buffer_limit: int = 2
    memory_cleanup_interval: int = 50
    target_resolution_height: int = 720
    plugin_skip_interval: Dict[str, int] = field(default_factory=lambda: {
        'DominantColorPlugin': 1,
        'TextDetectionPlugin': _get_positive_int_env(
            'ANALYSIS_TEXT_DETECTION_SKIP_INTERVAL',
            3,
        ),
        'ShotTypePlugin': 1,
        'DescriptorPlugin': _get_positive_int_env(
            'ANALYSIS_DESCRIPTOR_SKIP_INTERVAL',
            3,
        ),
        'FaceRecognitionPlugin': _get_positive_int_env(
            'ANALYSIS_FACE_RECOGNITION_SKIP_INTERVAL',
            3,
        ),
    })
    thumbnail_dir: str = field(
        default_factory=lambda: os.getenv(
            "THUMBNAILS_PATH",
            "/app/data/.thumbnails/"
        )
    )
    def __post_init__(self) -> None:
        """Post-initialization adjustments."""
        self._adjust_for_memory()

    def _adjust_for_memory(self) -> None:
        """Auto-adjust settings based on available memory."""
        try:
            import psutil
            available_gb = psutil.virtual_memory().available / (1024**3)

            if available_gb < 8:
                self.frame_buffer_limit = 4
                self.target_resolution_height = 480
            elif available_gb < 16:
                self.target_resolution_height = 720
        except ImportError:
            pass

    @property
    def device(self) -> str:
        """Determine optimal processing device."""
        try:
            import torch
            if torch.backends.mps.is_available():
                return 'mps'
            elif torch.cuda.is_available():
                return 'cuda'
        except ImportError:
            pass
        return 'cpu'


@dataclass
class TranscriptionConfig:
    """Transcription service configuration."""
    model_name: str = "medium"
    cache_dir: str = "ml-models/.whisper"
    beam_size: int = 1
    vad_filter: bool = True
    vad_threshold: float = 0.5
    min_speech_duration_ms: int = 250
    min_silence_duration_ms: int = 2000

    def __post_init__(self) -> None:
        """Post-initialization adjustments."""
        self.cache_dir = os.getenv(
            'TRANSCRIPTION_MODEL_CACHE', 'ml-models/.whisper')

    @property
    def device(self) -> str:
        """Determine optimal device for transcription."""
        try:
            import torch
            return "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            return "cpu"

    @property
    def compute_type(self) -> str:
        """Determine compute type based on device."""
        return "int8" if self.device == "cpu" else "int8_float16"


@dataclass
class ServerConfig:
    """WebSocket server configuration."""
    host: Optional[str] = None
    port: Optional[int] = None
    socket_path: Optional[str] = None
    max_concurrent_jobs: int = 2
    max_concurrent_analyses: int = 1
    max_concurrent_transcriptions: int = 1
    ping_interval: int = 30    
    ping_timeout: int = 60      
    close_timeout: int = 10   

    def __post_init__(self) -> None:
        """Validate and auto-calculate configuration."""
        if not self.socket_path and not (self.host and self.port):
            raise ValueError(
                "Either socket_path or (host and port) must be provided")
        self.max_concurrent_analyses = int(os.getenv(
            'MAX_CONCURRENT_ANALYSES', "1"))
        self.max_concurrent_transcriptions = int(os.getenv(
                'MAX_CONCURRENT_TRANSCRIPTIONS', 1))
                
