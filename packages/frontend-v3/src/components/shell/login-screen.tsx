"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.code === "ACCOUNT_LOCKED"
            ? "Account locked. Try again later."
            : err.message,
        );
      } else {
        setError("Network error — check your connection.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gda-bg-deep px-4">
      <Card className="w-full max-w-sm border-border bg-gda-panel">
        <CardHeader className="text-center">
          <div className="mb-2 font-mono text-2xl font-bold text-gda-green">
            GDA
          </div>
          <CardTitle className="font-mono text-lg text-foreground">
            Command Center
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Sign in to continue
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-border bg-gda-bg-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-border bg-gda-bg-base"
              />
            </div>
            {error && (
              <p className="text-sm text-gda-red">{error}</p>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gda-green text-gda-bg-deep hover:bg-gda-green-muted"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
