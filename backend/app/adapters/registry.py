from typing import Dict, Optional, Type
from app.adapters.base import BaseAdapter
from app.adapters.cursor_adapter import CursorAdapter
from app.adapters.copilot_adapter import CopilotAdapter
from app.adapters.windsurf_adapter import WindsurfAdapter
from app.adapters.claude_adapter import ClaudeAdapter


class AdapterRegistry:
    """
    Central registry for all tool adapters.
    Supports dynamic registration and lookup.
    """

    _adapters: Dict[str, BaseAdapter] = {}
    _adapter_classes: Dict[str, Type[BaseAdapter]] = {
        "cursor": CursorAdapter,
        "copilot": CopilotAdapter,
        "windsurf": WindsurfAdapter,
        "claude": ClaudeAdapter,
    }

    @classmethod
    def register_class(cls, adapter_id: str, adapter_class: Type[BaseAdapter]):
        cls._adapter_classes[adapter_id] = adapter_class

    @classmethod
    def create_adapter(cls, adapter_id: str, config: Dict = None) -> Optional[BaseAdapter]:
        adapter_class = cls._adapter_classes.get(adapter_id)
        if not adapter_class:
            return None
        adapter = adapter_class(adapter_id=adapter_id, config=config)
        cls._adapters[adapter_id] = adapter
        return adapter

    @classmethod
    def get_adapter(cls, adapter_id: str) -> Optional[BaseAdapter]:
        return cls._adapters.get(adapter_id)

    @classmethod
    def get_all_adapters(cls) -> Dict[str, BaseAdapter]:
        return cls._adapters.copy()

    @classmethod
    def get_available_adapter_types(cls) -> list[str]:
        return list(cls._adapter_classes.keys())

    @classmethod
    async def initialize_all(cls, enabled: list[str], configs: Dict = None):
        configs = configs or {}
        for adapter_id in enabled:
            if adapter_id in cls._adapter_classes:
                cls.create_adapter(adapter_id, configs.get(adapter_id, {}))

    @classmethod
    async def shutdown_all(cls):
        for adapter in cls._adapters.values():
            if adapter.is_connected:
                await adapter.disconnect()
        cls._adapters.clear()
