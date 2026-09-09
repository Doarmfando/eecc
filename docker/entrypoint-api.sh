#!/bin/sh
# Ajusta el volumen y baja privilegios antes de arrancar. Ver el equivalente del
# worker: el motivo es el mismo, un volumen montado como root.
set -e

DESTINO="${STORAGE_ROOT:-/data/storage}"
mkdir -p "$DESTINO"

if [ "$(id -u)" = "0" ]; then
    chown -R eecc:eecc "$DESTINO"
    # `su-exec` y no `setpriv`: en Alpine este último lo aporta BusyBox y solo
    # maneja capacidades, no sabe cambiar de usuario.
    exec su-exec eecc "$@"
fi

exec "$@"
