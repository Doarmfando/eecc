"""Arranque del servidor con un socket que acepta IPv4 e IPv6 a la vez.

Existe porque `uvicorn --host ::` **no** produce un socket de doble pila: escucha
solo en IPv6, y una red IPv4 —la de Docker por defecto, y la de muchos entornos—
recibe «conexión rechazada». Lo contrario, `--host 0.0.0.0`, deja el servicio
inalcanzable en redes privadas IPv6 como la de Railway.

Un socket creado con `dualstack_ipv6=True` acepta ambas familias, así que la misma
imagen sirve en los dos sitios sin configuración.
"""

from __future__ import annotations

import os
import socket
from collections.abc import Mapping

import uvicorn

from .main import app

DEFAULT_PORT = 8000


def leer_puerto(entorno: Mapping[str, str]) -> int:
    """Toma el puerto de `PORT`, que es lo que inyectan los PaaS.

    Un valor ilegible cae al puerto por defecto en vez de impedir el arranque: un
    servicio escuchando donde no se esperaba se diagnostica en segundos, y uno que
    no arranca por una variable mal escrita, no.
    """

    crudo = entorno.get("PORT", "").strip()
    if not crudo:
        return DEFAULT_PORT
    try:
        puerto = int(crudo)
    except ValueError:
        return DEFAULT_PORT
    if not 1 <= puerto <= 65535:
        return DEFAULT_PORT
    return puerto


def crear_socket(puerto: int) -> socket.socket:
    """Socket de escucha, de doble pila cuando la plataforma lo permite."""

    if socket.has_dualstack_ipv6():
        return socket.create_server(
            ("::", puerto),
            family=socket.AF_INET6,
            dualstack_ipv6=True,
        )
    # Sin IPv6 utilizable, IPv4 en todas las interfaces: en un contenedor,
    # `localhost` no se alcanza desde fuera.
    return socket.create_server(("0.0.0.0", puerto))


def main() -> None:
    puerto = leer_puerto(os.environ)
    escucha = crear_socket(puerto)
    servidor = uvicorn.Server(uvicorn.Config(app))
    servidor.run(sockets=[escucha])


if __name__ == "__main__":
    main()
