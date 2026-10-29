"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, errMessage } from "@/lib/ui/api";
import { Button, Card, CardBody, Input, Label, Alert } from "./ui";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password }),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errMessage(err));
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <Label htmlFor="name">Nama</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 10 : 1}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
            {mode === "register" && <p className="mt-1 text-xs text-slate-500">Minimal 10 karakter.</p>}
          </div>
          <Button type="submit" loading={loading} className="w-full justify-center">
            {mode === "register" ? "Daftar" : "Masuk"}
          </Button>
        </form>
        <p className="text-center text-sm text-slate-500">
          {mode === "register" ? (
            <>
              Sudah punya akun?{" "}
              <Link className="text-indigo-600 underline" href="/login">
                Masuk
              </Link>
            </>
          ) : (
            <>
              Belum punya akun?{" "}
              <Link className="text-indigo-600 underline" href="/register">
                Daftar
              </Link>
            </>
          )}
        </p>
      </CardBody>
    </Card>
  );
}
