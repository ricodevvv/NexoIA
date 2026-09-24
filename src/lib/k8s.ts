import { request } from "node:https";

type K8sResponse<T> = { status: number; body: T };

/**
 * Dice si Nexo tiene acceso al clúster para crear espacios de trabajo.
 */
export function k8sEnabled() {
  return Boolean(process.env.K8S_API && process.env.K8S_TOKEN && process.env.K8S_CA);
}

export function k8sNamespace() {
  return process.env.K8S_NAMESPACE ?? "nexo-ws";
}

/**
 * Llama a la API de Kubernetes con la cuenta de servicio de Nexo, que solo
 * tiene permisos dentro del namespace de los espacios de trabajo.
 */
export function k8s<T = unknown>(method: string, path: string, body?: unknown, contentType = "application/json"): Promise<K8sResponse<T>> {
  const url = new URL(path, process.env.K8S_API);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        ca: Buffer.from(process.env.K8S_CA ?? "", "base64"),
        headers: {
          Authorization: `Bearer ${process.env.K8S_TOKEN}`,
          Accept: "application/json",
          ...(payload ? { "Content-Type": contentType, "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown = text;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {}
          resolve({ status: res.statusCode ?? 0, body: parsed as T });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("La API de Kubernetes no respondió")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
