// Responses and errors shared by the desk's handlers.

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
export const fail = (status: number, reason: string): never => { throw new HttpError(status, reason); };
/** The JSON body every API refusal has. */
export const refusal = (status: number, reason: string) => json({ ok: false, reason }, status);
