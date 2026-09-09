"""El arranque del servidor: puerto y familia del socket."""

from __future__ import annotations

import socket
from unittest import TestCase

from statement_worker.api.serve import DEFAULT_PORT, crear_socket, leer_puerto


class LeerPuertoTests(TestCase):
    def test_usa_el_puerto_de_la_plataforma(self) -> None:
        self.assertEqual(leer_puerto({"PORT": "4321"}), 4321)

    def test_cae_al_valor_por_defecto_sin_variable(self) -> None:
        self.assertEqual(leer_puerto({}), DEFAULT_PORT)
        self.assertEqual(leer_puerto({"PORT": ""}), DEFAULT_PORT)
        self.assertEqual(leer_puerto({"PORT": "   "}), DEFAULT_PORT)

    def test_un_valor_ilegible_no_impide_arrancar(self) -> None:
        # Escuchar en el puerto por defecto se diagnostica en segundos; un servicio
        # que no arranca por una variable mal escrita, no.
        for valor in ("ocho mil", "-1", "0", "70000", "80.5"):
            with self.subTest(valor=valor):
                self.assertEqual(leer_puerto({"PORT": valor}), DEFAULT_PORT)


class CrearSocketTests(TestCase):
    def test_acepta_conexiones_ipv4_e_ipv6(self) -> None:
        """La razón de existir de este módulo.

        `uvicorn --host ::` escucha solo en IPv6 y una red IPv4 recibe «conexión
        rechazada»; `--host 0.0.0.0` deja fuera a las redes privadas IPv6.
        """

        escucha, alcance = crear_socket(0)
        try:
            self.assertIn("IPv", alcance)
            puerto = escucha.getsockname()[1]
            escucha.listen(2)

            familias = [(socket.AF_INET, ("127.0.0.1", puerto))]
            if socket.has_dualstack_ipv6():
                familias.append((socket.AF_INET6, ("::1", puerto)))

            for familia, destino in familias:
                with self.subTest(familia=familia.name):
                    cliente = socket.socket(familia, socket.SOCK_STREAM)
                    try:
                        cliente.settimeout(2)
                        cliente.connect(destino)
                    finally:
                        cliente.close()
        finally:
            escucha.close()


class DescripcionDelAlcanceTests(TestCase):
    def test_dice_por_que_familia_se_puede_llamar(self) -> None:
        """Quien despliega necesita saberlo: en Railway la red privada es IPv6 y
        en Docker por defecto es IPv4. Un servicio invisible se diagnostica leyendo
        esta línea del arranque."""

        escucha, alcance = crear_socket(0)
        try:
            self.assertRegex(alcance, r"(doble pila|solo IPv6|solo IPv4)")
        finally:
            escucha.close()
