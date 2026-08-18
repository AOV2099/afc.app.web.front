# Login Google AFC mediante gateway y ngrok

Ngrok se utiliza exclusivamente para HTTPS. La autenticación, usuarios y sesiones permanecen en AFC Back. No configurar ngrok OAuth, Traffic Policy OAuth ni un `policy.yaml` de autenticación.

## Arquitectura

```text
https://reclining-sulfur-reward.ngrok-free.dev
                    │
                  ngrok
                    │
          http://127.0.0.1:3010
                    │
              AFC Gateway
       ┌────────────┴────────────┐
       │                         │
 / y assets                 /api/* y /auth/*
       │                         │
http://127.0.0.1:3005   http://127.0.0.1:3004
    AFC Front                   AFC Back
```

El gateway escucha en loopback de forma predeterminada y no autentica usuarios. Conserva la URL del navegador mediante encabezados `X-Forwarded-*` controlados.

## Puertos

| Componente | Host | Contenedor |
| --- | ---: | ---: |
| AFC Front | `3005` | `3000` |
| AFC Back | `3004` | `3000` |
| AFC Gateway | `3010` | No aplica si se ejecuta en el host |

## Variables del backend

Configurar en el runtime de AFC Back:

```dotenv
GOOGLE_CLIENT_ID=<client-id-web>
GOOGLE_CLIENT_SECRET=<client-secret>
GOOGLE_ALLOWED_EMAIL_DOMAIN=

PUBLIC_URL=https://reclining-sulfur-reward.ngrok-free.dev
GOOGLE_CALLBACK_URL=https://reclining-sulfur-reward.ngrok-free.dev/auth/google/callback
GOOGLE_OAUTH_STATE_TTL_SECONDS=300
GOOGLE_OAUTH_STATE_COOKIE_NAME=afc_google_oauth_state

TRUST_PROXY=loopback
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

CORS_ALLOW_ANY_ORIGIN=false
CORS_ORIGIN=http://ecosistemadigital.aragon.unam.mx:3005,https://reclining-sulfur-reward.ngrok-free.dev
```

`COOKIE_SECURE=false` mantiene operativo el acceso HTTP actual. Cuando la petición proviene del gateway HTTPS confiable, Express usa automáticamente una cookie `Secure` gracias a `req.secure`.

`TRUST_PROXY=loopback` es correcto cuando el gateway conecta al backend desde `127.0.0.1`. No usar `true` ni confiar indiscriminadamente en todos los proxies.

## Variables del frontend

Configurar en AFC Front:

```dotenv
PUBLIC_API_BASE_URL=
PUBLIC_GOOGLE_CLIENT_ID=<client-id-web>
PUBLIC_GOOGLE_AUTH_MODE=gateway
AFC_BACKEND_URL=http://afc-back:3000
```

`PUBLIC_API_BASE_URL` debe quedar vacío. El navegador utiliza rutas relativas y el gateway enruta `/api` y `/auth`; una URL HTTP absoluta produciría contenido mixto.

Ajusta `AFC_BACKEND_URL` al nombre real del backend en la red Docker. Esa URL es solo para validación SSR y no se entrega al navegador.

## Levantar AFC

Levanta los contenedores actuales y comprueba:

```text
http://127.0.0.1:3005  → frontend
http://127.0.0.1:3004/health → backend
```

Recrear los contenedores después de cambiar variables; reiniciarlos no siempre aplica configuración nueva.

## Levantar el gateway

Desde AFC Front:

```text
npm ci
npm run gateway
```

Valores predeterminados:

```dotenv
GATEWAY_HOST=127.0.0.1
GATEWAY_PORT=3010
AFC_FRONT_TARGET=http://127.0.0.1:3005
AFC_BACK_TARGET=http://127.0.0.1:3004
```

Comprobación local:

```text
http://127.0.0.1:3010/gateway-health
```

Debe responder `{"ok":true,"service":"afc-gateway"}`.

## Ejecutar ngrok

En el servidor Linux:

```text
docker run --rm \
  --net=host \
  -it \
  -e NGROK_AUTHTOKEN="$NGROK_AUTHTOKEN" \
  ngrok/ngrok:latest \
  http 3010 \
  --url=https://reclining-sulfur-reward.ngrok-free.dev
```

No agregar políticas OAuth de ngrok.

Comprobaciones públicas:

```text
https://reclining-sulfur-reward.ngrok-free.dev/gateway-health
https://reclining-sulfur-reward.ngrok-free.dev/health/live
https://reclining-sulfur-reward.ngrok-free.dev/health
https://reclining-sulfur-reward.ngrok-free.dev/login
```

## Health checks

El gateway responde directamente a `/health/live`; esta ruta no llega al backend ni ejecuta comprobaciones de dependencias. AFC Back utiliza esa URL para validar el HTTPS público sin llamar recursivamente a `/api/health`.

Endpoints:

```text
GET /health/live      → liveness del gateway
GET /api/health/live  → liveness de AFC Back
GET /api/health       → PostgreSQL + Redis + HTTPS público
```

Pruebas:

```text
curl http://localhost:3004/api/health/live
curl http://localhost:3004/api/health
curl http://localhost:3010/health/live
curl https://reclining-sulfur-reward.ngrok-free.dev/api/health
```

El health completo devuelve `200` cuando todo está disponible y `503` cuando PostgreSQL, Redis o el endpoint HTTPS público están caídos. Todos los checks se ejecutan independientemente y la respuesta nunca contiene connection strings, tokens ni stack traces.

Variable opcional del backend:

```dotenv
HEALTHCHECK_TIMEOUT_MS=5000
```

Para simular fallos en un entorno de pruebas:

1. PostgreSQL: detener temporalmente su contenedor, consultar localmente `/api/health` y volver a iniciarlo.
2. Redis: detener temporalmente Redis, consultar `/api/health` y volver a iniciarlo.
3. ngrok: detener el túnel y consultar `http://localhost:3004/api/health`; la comprobación pública debe aparecer `down`.
4. Timeout: usar temporalmente una dependencia no enrutable y reducir `HEALTHCHECK_TIMEOUT_MS` a `500`.

No ejecutar estas simulaciones contra un entorno con usuarios activos.

## Google Cloud Console

Cliente OAuth: **Aplicación web**.

### Orígenes JavaScript autorizados

```text
https://reclining-sulfur-reward.ngrok-free.dev
```

El flujo gateway no depende de JavaScript de Google, pero registrar el origen permite conservar compatibilidad con el modo popup directo.

### URI de redireccionamiento autorizada

```text
https://reclining-sulfur-reward.ngrok-free.dev/auth/google/callback
```

La URI debe coincidir exactamente, sin diagonal final.

## Flujo punta a punta

1. Abrir `https://reclining-sulfur-reward.ngrok-free.dev/login`.
2. Presionar **Ingresar con Google**.
3. El navegador navega relativamente a `/auth/google`.
4. El gateway reenvía la ruta a AFC Back `3004`.
5. AFC Back genera `state`, PKCE y la autorización de Google.
6. Google retorna por HTTPS a `/auth/google/callback`.
7. AFC Back consume el estado una sola vez, canjea el código, verifica el ID token y crea/vincula el usuario.
8. AFC Back crea la sesión Redis, establece `afc_sid` HTTP-only y Secure, y redirige según el rol.
9. Confirmar que `/api/me` devuelve el usuario autenticado.
10. Confirmar que el login tradicional continúa funcionando en la URL HTTP actual.

## Errores de diagnóstico

- `public_url_missing`: falta `PUBLIC_URL`.
- `public_url_https_required`: la URL pública no usa HTTPS.
- `forwarded_https_missing`: revisar gateway y `TRUST_PROXY=loopback`.
- `forwarded_host_mismatch`: el dominio recibido no coincide con `PUBLIC_URL`.
- `redirect_uri_mismatch`: Google Cloud no contiene el callback exacto.
- `invalid_state`: cookie ausente, estado expirado o intento reutilizado.
- `502 Servicio AFC no disponible`: front o back no escuchan en `3005`/`3004`.
- Cookie ausente: revisar que la navegación completa se realice por la URL HTTPS y que no exista `COOKIE_DOMAIN` incompatible.

Los logs no deben contener authorization codes, access tokens, refresh tokens, ID tokens completos, Client Secret ni cookies.

## Migración futura

Para Cloudflare Tunnel o HTTPS nativo:

1. Cambiar `PUBLIC_URL`.
2. Cambiar `GOOGLE_CALLBACK_URL`.
3. Actualizar Google Cloud Console.
4. Apuntar la nueva entrada HTTPS al gateway `3010` o directamente a una infraestructura equivalente.
5. Mantener las rutas `/auth/google` y `/auth/google/callback`.

No se requieren cambios en la lógica OAuth.
