import { useId, useState, type ReactNode } from 'react';

import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mensajeDeError } from '@/features/users/error-messages';
import type { CreatePlanInput, PlanAdminOption, UpdatePlanInput } from '@/lib/session-client';

import { FEATURE, NOMBRE_FUNCION, type FeatureCode } from './access';
import { useCreatePlan, useUpdatePlan } from './queries';

const contenidoClass = 'max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto';

const TODAS_LAS_FUNCIONES = Object.values(FEATURE);

/** Lo que el formulario de un plan necesita, todo como texto: se convierte al enviar. */
interface FormularioDePlan {
  code: string;
  name: string;
  description: string;
  maxRetainedStatements: string;
  maxPagesPerDocument: string;
  monthlyPageQuota: string;
  trialOneTime: boolean;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: string;
  features: FeatureCode[];
}

function formularioVacio(): FormularioDePlan {
  return {
    code: '',
    name: '',
    description: '',
    maxRetainedStatements: '3',
    maxPagesPerDocument: '',
    monthlyPageQuota: '',
    trialOneTime: false,
    isDefault: false,
    isActive: true,
    sortOrder: '0',
    features: [],
  };
}

function formularioDe(plan: PlanAdminOption): FormularioDePlan {
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description,
    maxRetainedStatements: plan.maxRetainedStatements.toString(),
    maxPagesPerDocument: plan.maxPagesPerDocument?.toString() ?? '',
    monthlyPageQuota: plan.monthlyPageQuota?.toString() ?? '',
    trialOneTime: plan.trialOneTime,
    isDefault: plan.isDefault,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder.toString(),
    features: plan.features.filter((codigo): codigo is FeatureCode =>
      TODAS_LAS_FUNCIONES.includes(codigo as FeatureCode),
    ),
  };
}

/** `""` vuelve `undefined` (no tocar) o `null` (sin tope), según `vacioEsNulo`. */
function numeroOpcional(valor: string, vacioEsNulo: boolean): number | null | undefined {
  if (valor.trim() === '') {
    return vacioEsNulo ? null : undefined;
  }
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : undefined;
}

function datosComunes(form: FormularioDePlan): Omit<CreatePlanInput, 'code'> {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    maxRetainedStatements: Number(form.maxRetainedStatements),
    maxPagesPerDocument: numeroOpcional(form.maxPagesPerDocument, false),
    monthlyPageQuota: numeroOpcional(form.monthlyPageQuota, true),
    trialOneTime: form.trialOneTime,
    isDefault: form.isDefault,
    isActive: form.isActive,
    sortOrder: Number(form.sortOrder),
    features: form.features,
  };
}

function FuncionesChoice({
  value,
  onChange,
  idPrefix,
}: {
  value: FeatureCode[];
  onChange: (valor: FeatureCode[]) => void;
  idPrefix: string;
}): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      {TODAS_LAS_FUNCIONES.map((codigo) => (
        <label
          key={codigo}
          htmlFor={`${idPrefix}-${codigo}`}
          className="flex items-center gap-2 text-sm"
        >
          <input
            id={`${idPrefix}-${codigo}`}
            type="checkbox"
            className="size-4 rounded border-border"
            checked={value.includes(codigo)}
            onChange={(event) => {
              onChange(
                event.target.checked
                  ? [...value, codigo]
                  : value.filter((existente) => existente !== codigo),
              );
            }}
          />
          {NOMBRE_FUNCION[codigo]}
        </label>
      ))}
    </div>
  );
}

function CamposDePlan({
  form,
  onChange,
  esNuevo,
}: {
  form: FormularioDePlan;
  onChange: (cambios: Partial<FormularioDePlan>) => void;
  esNuevo: boolean;
}): ReactNode {
  const codigoId = useId();
  const nombreId = useId();
  const descripcionId = useId();
  const documentosId = useId();
  const topeTecnicoId = useId();
  const paginasId = useId();
  const ordenId = useId();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={codigoId}>Código</Label>
          <Input
            id={codigoId}
            autoComplete="off"
            placeholder="PRO"
            readOnly={!esNuevo}
            value={form.code}
            onChange={(event) => {
              onChange({ code: event.target.value.toUpperCase() });
            }}
          />
          {esNuevo ? (
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
            value={form.name}
            onChange={(event) => {
              onChange({ name: event.target.value });
            }}
          />
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

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={documentosId}>Documentos guardados</Label>
          <Input
            id={documentosId}
            type="number"
            min={1}
            max={1000}
            value={form.maxRetainedStatements}
            onChange={(event) => {
              onChange({ maxRetainedStatements: event.target.value });
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={paginasId}>Páginas acumuladas al mes</Label>
          <Input
            id={paginasId}
            type="number"
            min={1}
            placeholder="Sin tope fijo"
            value={form.monthlyPageQuota}
            onChange={(event) => {
              onChange({ monthlyPageQuota: event.target.value });
            }}
          />
          <p className="text-xs text-muted-foreground">Vacío: se cotiza, como Atlas.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={topeTecnicoId}>Tope técnico por PDF</Label>
          <Input
            id={topeTecnicoId}
            type="number"
            min={1}
            placeholder="1000"
            value={form.maxPagesPerDocument}
            onChange={(event) => {
              onChange({ maxPagesPerDocument: event.target.value });
            }}
          />
          <p className="text-xs text-muted-foreground">Protección del worker; vacío usa 1000.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-border"
              checked={form.trialOneTime}
              onChange={(event) => {
                onChange({ trialOneTime: event.target.checked });
              }}
            />
            Prueba única, no se renueva
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-border"
              checked={form.isDefault}
              onChange={(event) => {
                onChange({ isDefault: event.target.checked });
              }}
            />
            Plan predeterminado en el alta
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-border"
              checked={form.isActive}
              onChange={(event) => {
                onChange({ isActive: event.target.checked });
              }}
            />
            Activo (se ofrece en altas y cambios)
          </label>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Vistas que habilita</legend>
        <FuncionesChoice
          value={form.features}
          onChange={(features) => {
            onChange({ features });
          }}
          idPrefix={codigoId}
        />
      </fieldset>
    </div>
  );
}

export function CrearPlanDialog({
  open,
  onCerrar,
}: {
  open: boolean;
  onCerrar: () => void;
}): ReactNode {
  const [form, setForm] = useState<FormularioDePlan>(formularioVacio());
  const crear = useCreatePlan();

  function cerrarYLimpiar(): void {
    setForm(formularioVacio());
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
          <DialogTitle>Nuevo plan</DialogTitle>
          <DialogDescription>
            Crea una membresía en el catálogo. El código no se puede cambiar después.
          </DialogDescription>
        </div>

        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (form.code.trim() === '' || form.name.trim() === '') {
              return;
            }
            crear.mutate(
              { code: form.code.trim(), ...datosComunes(form) },
              { onSuccess: cerrarYLimpiar },
            );
          }}
        >
          <CamposDePlan
            form={form}
            onChange={(cambios) => {
              setForm((actual) => ({ ...actual, ...cambios }));
            }}
            esNuevo
          />

          {crear.isError ? (
            <Alert variant="destructive" title="No se pudo crear el plan">
              {mensajeDeError(crear.error)}
              <SupportDetails error={crear.error} />
            </Alert>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={cerrarYLimpiar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={crear.isPending}>
              {crear.isPending ? 'Creando…' : 'Crear plan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditarPlanDialog({
  plan,
  onCerrar,
}: {
  plan: PlanAdminOption | null;
  onCerrar: () => void;
}): ReactNode {
  const [form, setForm] = useState<FormularioDePlan | null>(null);
  const actual = plan ? (form ?? formularioDe(plan)) : null;
  const actualizar = useUpdatePlan();

  function cerrarYLimpiar(): void {
    setForm(null);
    actualizar.reset();
    onCerrar();
  }

  return (
    <Dialog
      open={plan !== null}
      onOpenChange={(abierto) => {
        if (!abierto) cerrarYLimpiar();
      }}
    >
      {plan && actual ? (
        <DialogContent className={contenidoClass}>
          <div className="space-y-1.5 pr-6">
            <DialogTitle>Editar {plan.name}</DialogTitle>
            <DialogDescription>Solo se guarda lo que cambies.</DialogDescription>
          </div>

          <form
            className="space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const cambios: UpdatePlanInput = datosComunes(actual);
              actualizar.mutate({ code: plan.code, cambios }, { onSuccess: cerrarYLimpiar });
            }}
          >
            <CamposDePlan
              form={actual}
              onChange={(cambios) => {
                setForm({ ...actual, ...cambios });
              }}
              esNuevo={false}
            />

            {actualizar.isError ? (
              <Alert variant="destructive" title="No se pudo guardar el plan">
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
