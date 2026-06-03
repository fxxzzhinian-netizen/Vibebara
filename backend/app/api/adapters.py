from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from app.adapters.registry import AdapterRegistry

api_router = APIRouter(prefix="/adapters", tags=["adapters"])


@api_router.get("/")
async def list_adapters() -> List[Dict[str, Any]]:
    adapters = AdapterRegistry.get_all_adapters()
    result = []
    for adapter_id, adapter in adapters.items():
        result.append(await adapter.health_check())
    return result


@api_router.get("/available")
async def list_available_types() -> List[str]:
    return AdapterRegistry.get_available_adapter_types()


@api_router.post("/{adapter_id}/connect")
async def connect_adapter(adapter_id: str, credentials: Dict[str, Any] = {}):
    adapter = AdapterRegistry.get_adapter(adapter_id)
    if not adapter:
        raise HTTPException(status_code=404, detail=f"Adapter '{adapter_id}' not found")
    success = await adapter.connect(credentials)
    if not success:
        raise HTTPException(status_code=500, detail="Connection failed")
    return {"status": "connected", "adapter": adapter_id}


@api_router.post("/{adapter_id}/disconnect")
async def disconnect_adapter(adapter_id: str):
    adapter = AdapterRegistry.get_adapter(adapter_id)
    if not adapter:
        raise HTTPException(status_code=404, detail=f"Adapter '{adapter_id}' not found")
    await adapter.disconnect()
    return {"status": "disconnected", "adapter": adapter_id}


@api_router.post("/{adapter_id}/inbound")
async def receive_from_tool(adapter_id: str, message: Dict[str, Any]):
    """
    Webhook endpoint: external tools push messages here.
    The adapter translates them into unified events.
    """
    adapter = AdapterRegistry.get_adapter(adapter_id)
    if not adapter:
        raise HTTPException(status_code=404, detail=f"Adapter '{adapter_id}' not found")

    from app.services.message_router import router as message_router
    event = await adapter.translate_inbound(message)
    delivered = await message_router.route_event(event)
    return {"event_id": event.id, "delivered_to": delivered}
