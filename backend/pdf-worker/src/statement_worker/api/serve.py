"""Arranque del servidor con un socket alcanzable en la red que haya.

Existe porque la familia de red no es la misma en todas partes y equivocarse deja
el servicio invisible sin decir por qué:

- `uvicorn --host ::` **no** crea un socket de doble pila: escucha solo en IPv6 y
  una red IPv4 —la de Docker por defecto— recibe «conexión rechazada»;
- `--host 0.0.0.0` deja el servicio inalcanzable en redes privadas IPv6, como la
  de Railway, donde los servicios se llaman por `<nombre>.railway.internal`.

Se intenta la opción más amplia primero y se registra cuál quedó, para que un
fallo de conectividad se diagnostique leyendo el arranque y no a ciegas.
"""

from __future__ import annotations

import logging
import os
import socket
from collections.abc import Mapping

import uvicorn

from .main import app

DEFAULT_PORT = 8000

_log = logging.getLogger("statement_worker.serve")


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


def crear_socket(puerto: int) -> tuple[socket.socket, str]:
    """Devuelve el socket de escucha y una descripción de lo que se logró.

    El orden va de más alcance a menos: doble pila cubre ambas familias; IPv6 solo
    cubre las redes privadas de los PaaS; IPv4 es el último recurso. Bajar un
    escalón nunca es silencioso, porque quien despliegue necesita saber por cuál
    de las dos familias puede llamar al servicio.
    """

    if socket.has_dualstack_ipv6():
        try:
            escucha = socket.create_server(
                ("::", puerto), family=socket.AF_INET6, dualstack_ipv6=True
            )
            return escucha, "IPv4 e IPv6 (doble pila) en [::]"
        except OSError:
            pass

    if socket.has_ipv6:
        try:
            escucha = socket.create_server(("::", puerto), family=socket.AF_INET6)
            return escucha, "solo IPv6 en [::]"
        except OSError:
            pass

    # En un contenedor, `localhost` no se alcanza desde fuera.
    return socket.create_server(("0.0.0.0", puerto)), "solo IPv4 en 0.0.0.0"


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    puerto = leer_puerto(os.environ)
    escucha, alcance = crear_socket(puerto)
    _log.info("Worker escuchando en el puerto %d: %s", puerto, alcance)

    servidor = uvicorn.Server(uvicorn.Config(app))
    servidor.run(sockets=[escucha])


if __name__ == "__main__":
    main()
