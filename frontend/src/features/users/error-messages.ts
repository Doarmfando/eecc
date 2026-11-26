import { ApiError } from '@/lib/api-error';

/**
 * Motivos por código. El servidor aplica cada regla; aquí solo se explica, para
 * que un rechazo diga qué hacer en vez de «no se pudo».
 */
const MENSAJES: Record<string, string> = {
  MEMBER_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo en la organización.',
  EMAIL_ALREADY_IN_USE: 'Ese correo ya lo usa otra cuenta.',
  EMAIL_DOMAIN_NOT_ALLOWED: 'Ese dominio de correo no está admitido en la organización.',
  MEMBER_IN_OTHER_ORGANIZATION:
    'Esta cuenta también pertenece a otra organización: su nombre, correo y contraseña no se pueden cambiar desde aquí.',
  ADMIN_CANNOT_BE_DELETED:
    'No puedes eliminar una cuenta de tu mismo rango. Puedes desactivarla, o pedírselo a alguien de rango superior.',
  ADMIN_CANNOT_BE_DEMOTED:
    'No puedes cambiar el rol de una cuenta de tu mismo rango. Pídeselo a alguien de rango superior.',
  CANNOT_MODIFY_SELF: 'Ese cambio no se puede hacer sobre tu propia cuenta.',
  MEMBER_NOT_FOUND: 'Esa cuenta ya no existe. Recarga la lista.',
  INSUFFICIENT_ROLE: 'Solo un administrador puede gestionar cuentas.',
  ROLE_ABOVE_YOURS:
    'Esa cuenta, o el rol que quieres darle, está por encima del tuyo. Pídeselo a un superadministrador.',
  ROLE_NOT_FOUND: 'Ese rol ya no existe. Recarga la página.',
  PLAN_NOT_FOUND: 'Esa membresía ya no está disponible. Recarga la página y elige otra.',
  ADMIN_PLAN_REQUIRES_ADMIN_ROLE:
    'Administración es una membresía interna. Elige una membresía comercial para este rol.',
  PLAN_ALREADY_EXISTS: 'Ya existe un plan con ese código. Elige otro: no se puede reutilizar.',
  PRODUCT_ALREADY_EXISTS:
    'Ya existe un producto con ese código. Elige otro: no se puede reutilizar.',
  PRODUCT_NOT_FOUND: 'Ese producto ya no existe. Recarga la página.',
  QUANTITY_BELOW_MINIMUM: 'Esa compra no llega al mínimo de páginas del producto.',
  INVALID_REPORT_DATES: 'Elige fechas válidas en orden, con un rango de hasta 366 días.',
  REPORT_ORGANIZATION_FORBIDDEN: 'El informe solo está disponible para tu organización activa.',
  PAYMENT_REFERENCE_INVALID: 'Revisa el número de operación ingresado.',
  PAYMENT_REFERENCE_USED: 'Ese número de operación ya está registrado.',
  PERSONAL_PAID_PERIOD_PROTECTED:
    'La cuenta ya tiene un periodo de Personal pagado. Usa el registro de pagos para renovar su vigencia.',
  PERSONAL_PAYMENT_REQUIRED:
    'Activa o renueva Personal registrando un pago confirmado en el detalle de la cuenta. Para una cuenta nueva, elige Gratuito primero.',
  PERSONAL_TRANSITION_REQUIRED:
    'Esta cuenta requiere revisar las condiciones de su plan antes de registrar Personal.',
  PERSONAL_UNAVAILABLE: 'ATLAS Personal no está disponible para esta operación.',
  PERSONAL_PRICE_CHANGED:
    'El precio cambió. Cierra y vuelve a consultar la membresía antes de registrar el pago.',
  PERSONAL_SCHEDULE_CONFLICT:
    'La vigencia administrada no coincide con los periodos ya pagados. Revisa el historial antes de registrar otro pago.',
  MEMBERSHIP_NOT_FOUND: 'Esa cuenta ya no tiene membresía en la organización. Recarga la página.',
  PRODUCT_PRICING_SHAPE_INVALID:
    'Un paquete necesita cuántas páginas trae, y una recarga su mínimo de páginas por compra.',
  MONTHLY_PAGE_QUOTA_OVERRIDE_INVALID: 'La recarga debe ser un número entero mayor que cero.',
  PLAN_EXPIRY_REQUIRED: 'Indica hasta cuándo vale la membresía de este usuario.',
  PLAN_EXPIRY_IN_PAST: 'La fecha de vencimiento no puede ser anterior a hoy.',
  PLAN_EXPIRY_INVALID: 'Esa fecha de vencimiento no existe. Revísala.',
  VALIDATION_FAILED: 'Algún dato no tiene un formato válido. Revísalos.',
  NETWORK_ERROR: 'No se pudo contactar con el servidor.',
};

export function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    return MENSAJES[error.code] ?? 'No se pudo completar la operación.';
  }
  return 'No se pudo completar la operación.';
}
