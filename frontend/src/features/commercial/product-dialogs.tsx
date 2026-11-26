import { useId, useState, type ReactNode } from 'react';

import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mensajeDeError } from '@/features/users/error-messages';
import { FieldError } from '@/features/users/form-fields';
import { centsToPriceInput, parsePriceInput } from '@/lib/money';
import type {
  CommercialPricing,
  CommercialProductAdmin,
  CreateCommercialProductInput,
} from '@/lib/session-client';

import { useCreateCommercialProduct, useUpdateCommercialProduct } from './queries';

const contenidoClass = 'max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto';

const NOMBRE_FORMA_DE_PRECIO: Record<CommercialPricing, string> = {
  PER_PAGE: 'Por página',
  PACKAGE: 'Paquete',
};

/** Todo como texto, como se escribe; se valida y convierte al enviar. */
interface FormularioDeProducto {
  code: string;
  name: string;
  description: string;
  pricing: CommercialPricing;
  /** Páginas del paquete o mínimo por compra, según `pricing`. */
  pages: string;
  price: string;
  validityDays: string;
  sortOrder: string;
  isActive: boolean;
}

function formularioVacio(): FormularioDeProducto {
  return {
    code: '',
    name: '',
    description: '',
    pricing: 'PACKAGE',
    pages: '',
    price: '',
    validityDays: '90',
    sortOrder: '0',
    isActive: true,
  };
}

function formularioDe(producto: CommercialProductAdmin): FormularioDeProducto {
  const paginas = producto.pricing === 'PACKAGE' ? producto.pageQuantity : producto.minimumPages;
  return {
    code: producto.code,
    name: producto.name,
    description: producto.description,
    pricing: producto.pricing,
    pages: paginas?.toString() ?? '',
    price: centsToPriceInput(producto.priceCents),
    validityDays: producto.validityDays.toString(),
    sortOrder: producto.sortOrder.toString(),
    isActive: producto.isActive,
  };
}

/** Entero positivo escrito en un campo, o `null` si no lo es. */
function enteroPositivo(valor: string): number | null {
  const limpio = valor.trim();
  if (!/^\d+$/.test(limpio)) {
    return null;
  }
  const numero = Number(limpio);
  return numero > 0 ? numero : null;
}

interface Errores {
  code?: string;
  name?: string;
  pages?: string;
  price?: string;
  validityDays?: string;
}

function validar(form: FormularioDeProducto): Errores {
  const errores: Errores = {};
  if (form.code.trim() === '') errores.code = 'Escribe un código';
  if (form.name.trim() === '') errores.name = 'Escribe un nombre';
  if (enteroPositivo(form.pages) === null) {
    errores.pages =
      form.pricing === 'PACKAGE'
        ? 'Indica cuántas páginas trae el paquete'
        : 'Indica el mínimo de páginas por compra';
  }
  if (parsePriceInput(form.price) === null) {
    errores.price = 'Escribe un precio como 29.90, sin signo ni más de dos decimales.';
  }
  if (enteroPositivo(form.validityDays) === null) {
    errores.validityDays = 'Indica en cuántos días vence';
  }
  return errores;
}

function CamposDeProducto({
  form,
  onChange,
  esNuevo,
  errores,
}: {
  form: FormularioDeProducto;
  onChange: (cambios: Partial<FormularioDeProducto>) => void;
  esNuevo: boolean;
  /** Solo tras un intento de enviar: no se tacha un campo vacío sin motivo. */
  errores: Errores;
}): ReactNode {
  const codigoId = useId();
  const nombreId = useId();
  const descripcionId = useId();
  const paginasId = useId();
  const precioId = useId();
  const vigenciaId = useId();
  const ordenId = useId();
  const esPaquete = form.pricing === 'PACKAGE';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={codigoId}>Código</Label>
          <Input
            id={codigoId}
            autoComplete="off"
            placeholder="PROFESIONAL_10000"
            readOnly={!esNuevo}
            aria-invalid={errores.code ? true : undefined}
            value={form.code}
            onChange={(event) => {
              onChange({ code: event.target.value.toUpperCase() });
            }}
          />
          {errores.code ? (
            <FieldError message={errores.code} />
          ) : esNuevo ? (
            <p className="text-xs text-muted-foreground">
              Mayúsculas; no se puede cambiar después.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={nombreId}>Nombre</Label>
          <Input
            id={nombreId}
            autoComplete="off"
            aria-invalid={errores.name ? true : undefined}
            value={form.name}
            onChange={(event) => {
              onChange({ name: event.target.value });
            }}
          />
          <FieldError message={errores.name} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={descripcionId}>Descripción</Label>
        <Input
          id={descripcionId}
          autoComplete="off"
          value={form.description}
          onChange={(event) => {
            onChange({ description: event.target.value });
          }}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Cómo se cobra</legend>
        <div className="flex flex-wrap gap-4">
          {(['PACKAGE', 'PER_PAGE'] as const).map((forma) => (
            <label key={forma} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${codigoId}-forma`}
                className="size-4 border-border"
                disabled={!esNuevo}
                checked={form.pricing === forma}
                onChange={() => {
                  onChange({ pricing: forma });
                }}
              />
              {NOMBRE_FORMA_DE_PRECIO[forma]}
            </label>
          ))}
        </div>
        {!esNuevo ? (
          <p className="mt-1 text-xs text-muted-foreground">
            No se puede cambiar: un paquete que pasa a cobrarse por página es otro producto.
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={paginasId}>
            {esPaquete ? 'Páginas del paquete' : 'Mínimo de páginas'}
          </Label>
          <Input
            id={paginasId}
            type="number"
            min={1}
            aria-invalid={errores.pages ? true : undefined}
            value={form.pages}
            onChange={(event) => {
              onChange({ pages: event.target.value });
            }}
          />
          <FieldError message={errores.pages} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={precioId}>
            {esPaquete ? 'Precio del paquete (S/)' : 'Precio por página (S/)'}
          </Label>
          <Input
            id={precioId}
            inputMode="decimal"
            autoComplete="off"
            placeholder={esPaquete ? '29.90' : '0.15'}
            aria-invalid={errores.price ? true : undefined}
            value={form.price}
            onChange={(event) => {
              onChange({ price: event.target.value });
            }}
          />
          <FieldError message={errores.price} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={vigenciaId}>Vence a los (días)</Label>
          <Input
            id={vigenciaId}
            type="number"
            min={1}
            aria-invalid={errores.validityDays ? true : undefined}
            value={form.validityDays}
            onChange={(event) => {
              onChange({ validityDays: event.target.value });
            }}
          />
          {errores.validityDays ? (
            <FieldError message={errores.validityDays} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Contados desde que se registra la compra.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor={ordenId}>Orden al ofrecerlo</Label>
          <Input
            id={ordenId}
            type="number"
            value={form.sortOrder}
            onChange={(event) => {
              onChange({ sortOrder: event.target.value });
            }}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 rounded border-border"
          checked={form.isActive}
          onChange={(event) => {
            onChange({ isActive: event.target.checked });
          }}
        />
        Activo (se ofrece y se puede comprar)
      </label>
    </div>
  );
}

/** Lo que se envía tanto al crear como al guardar: todo menos código y forma de precio. */
type DatosDeProducto = Omit<
  CreateCommercialProductInput,
  'code' | 'pricing' | 'pageQuantity' | 'minimumPages'
> & { pageQuantity?: number; minimumPages?: number };

/** Solo se llama con un formulario ya validado. */
function datosDe(form: FormularioDeProducto): DatosDeProducto {
  const paginas = enteroPositivo(form.pages) ?? 0;
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    priceCents: parsePriceInput(form.price) ?? 0,
    validityDays: enteroPositivo(form.validityDays) ?? 0,
    isActive: form.isActive,
    sortOrder: Number(form.sortOrder) || 0,
    ...(form.pricing === 'PACKAGE' ? { pageQuantity: paginas } : { minimumPages: paginas }),
  };
}

export function CrearProductoDialog({
  open,
  onCerrar,
}: {
  open: boolean;
  onCerrar: () => void;
}): ReactNode {
  const [form, setForm] = useState<FormularioDeProducto>(formularioVacio());
  const [intento, setIntento] = useState(false);
  const crear = useCreateCommercialProduct();
  const errores = intento ? validar(form) : {};

  function cerrarYLimpiar(): void {
    setForm(formularioVacio());
    setIntento(false);
    crear.reset();
    onCerrar();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => {
        if (!abierto) cerrarYLimpiar();
      }}
    >
      <DialogContent className={contenidoClass}>
        <div className="space-y-1.5 pr-6">
          <DialogTitle>Nuevo producto de saldo</DialogTitle>
          <DialogDescription>
            Un paquete de páginas o una recarga por página. No habilita vistas: solo da saldo.
          </DialogDescription>
        </div>

        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (Object.keys(validar(form)).length > 0) {
              setIntento(true);
              return;
            }
            crear.mutate(
              { code: form.code.trim(), pricing: form.pricing, ...datosDe(form) },
              { onSuccess: cerrarYLimpiar },
            );
          }}
        >
          <CamposDeProducto
            form={form}
            onChange={(cambios) => {
              setForm((actual) => ({ ...actual, ...cambios }));
            }}
            esNuevo
            errores={errores}
          />

          {crear.isError ? (
            <Alert variant="destructive" title="No se pudo crear el producto">
              {mensajeDeError(crear.error)}
              <SupportDetails error={crear.error} />
            </Alert>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={cerrarYLimpiar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={crear.isPending}>
              {crear.isPending ? 'Creando…' : 'Crear producto'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditarProductoDialog({
  producto,
  onCerrar,
}: {
  producto: CommercialProductAdmin | null;
  onCerrar: () => void;
}): ReactNode {
  const [form, setForm] = useState<FormularioDeProducto | null>(null);
  const [intento, setIntento] = useState(false);
  const actual = producto ? (form ?? formularioDe(producto)) : null;
  const actualizar = useUpdateCommercialProduct();
  const errores = intento && actual ? validar(actual) : {};

  function cerrarYLimpiar(): void {
    setForm(null);
    setIntento(false);
    actualizar.reset();
    onCerrar();
  }

  return (
    <Dialog
      open={producto !== null}
      onOpenChange={(abierto) => {
        if (!abierto) cerrarYLimpiar();
      }}
    >
      {producto && actual ? (
        <DialogContent className={contenidoClass}>
          <div className="space-y-1.5 pr-6">
            <DialogTitle>Editar {producto.name}</DialogTitle>
            <DialogDescription>
              Un cambio de precio o vigencia aplica a las compras siguientes, no a las ya
              registradas.
            </DialogDescription>
          </div>

          <form
            className="space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (Object.keys(validar(actual)).length > 0) {
                setIntento(true);
                return;
              }
              actualizar.mutate(
                { code: producto.code, cambios: datosDe(actual) },
                { onSuccess: cerrarYLimpiar },
              );
            }}
          >
            <CamposDeProducto
              form={actual}
              onChange={(cambios) => {
                setForm({ ...actual, ...cambios });
              }}
              esNuevo={false}
              errores={errores}
            />

            {actualizar.isError ? (
              <Alert variant="destructive" title="No se pudo guardar el producto">
                {mensajeDeError(actualizar.error)}
                <SupportDetails error={actualizar.error} />
              </Alert>
            ) : null}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={cerrarYLimpiar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={actualizar.isPending}>
                {actualizar.isPending ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
