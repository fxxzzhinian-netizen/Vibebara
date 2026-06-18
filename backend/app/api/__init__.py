"""API 路由包。

各 router 由 ``app.main`` 直接按模块挂载（``from app.api.<mod> import api_router``），
此处不再做聚合 re-export，避免与 ``main.py`` 的挂载清单出现不一致。
"""
