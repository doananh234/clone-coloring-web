"use client";

import { useState } from "react";
import { Icon } from "../../lib/icon";
import { Card } from "../../components/ui/card";
import { Badge, type BadgeTone } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { LoadingRows, EmptyState, ErrorState } from "../../components/ui/states";
import { useColoringAuth } from "../../hooks/coloring-auth";
import { useOperators, type OperatorRow } from "../../data/use-operators";
import { useOperatorActions } from "../../data/use-operator-actions";

const th = { textAlign: "left" as const, padding: "10px 12px", fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "var(--tracking-caps)", color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" };
const td = { padding: 12, borderBottom: "1px solid var(--border)" };
const roleTone: Record<string, BadgeTone> = { admin: "carbon", operator: "neutral" };

interface FormState {
  id?: string;
  username: string;
  name: string;
  password: string;
  role: string;
}
const EMPTY_FORM: FormState = { username: "", name: "", password: "", role: "operator" };

export function OperatorsScreen() {
  const { user } = useColoringAuth();
  const { operators, isLoading, isError, refresh } = useOperators();
  const { create, update, remove, resetPassword, isPending } = useOperatorActions();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin";
  if (!isAdmin) {
    return <EmptyState icon="shield" title="Không có quyền" sub="Chỉ quản trị viên mới truy cập được mục này." />;
  }

  function openCreate() {
    setError("");
    setForm({ ...EMPTY_FORM });
  }
  function openEdit(o: OperatorRow) {
    setError("");
    setForm({ id: o.id, username: o.username, name: o.name, password: "", role: o.role });
  }

  async function submit() {
    if (!form) return;
    setError("");
    try {
      if (form.id) {
        await update(form.id, { name: form.name, role: form.role });
        if (form.password) await resetPassword(form.id, form.password);
      } else {
        await create({ username: form.username, name: form.name, password: form.password, role: form.role });
      }
      setForm(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lưu thất bại");
    }
  }

  async function onDelete(o: OperatorRow) {
    if (!confirm(`Xoá tài khoản "${o.username}"?`)) return;
    setError("");
    try {
      await remove(o.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xoá thất bại");
    }
  }

  async function onToggleDisabled(o: OperatorRow) {
    setError("");
    try {
      await update(o.id, { disabled: !o.disabled });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cập nhật thất bại");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Tài khoản</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>
            {isLoading ? "Đang tải…" : `${operators.length} tài khoản quản trị`}
          </p>
        </div>
        <Button onClick={openCreate}><Icon name="plus" size={16} /> Thêm tài khoản</Button>
      </div>

      {error && <div style={{ color: "var(--destructive)", fontSize: 13 }}>{error}</div>}

      <Card>
        {isLoading ? (
          <LoadingRows rows={4} />
        ) : isError ? (
          <ErrorState sub="Không gọi được /api/operators." />
        ) : operators.length === 0 ? (
          <EmptyState icon="user" title="Chưa có tài khoản" sub="Thêm tài khoản quản trị đầu tiên." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 640 }}>
              <thead><tr>
                <th style={th}>Tên đăng nhập</th><th style={th}>Tên</th><th style={th}>Quyền</th><th style={th}>Trạng thái</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {operators.map((o) => (
                  <tr key={o.id} className="mo-row">
                    <td style={td}><span style={{ fontWeight: 600 }}>{o.username}</span></td>
                    <td style={td}>{o.name}</td>
                    <td style={td}><Badge tone={roleTone[o.role] ?? "neutral"}>{o.role}</Badge></td>
                    <td style={td}><Badge tone={o.disabled ? "neutral" : "success"}>{o.disabled ? "Đã khoá" : "Hoạt động"}</Badge></td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" className="mo-iconbtn" onClick={() => openEdit(o)} title="Sửa" aria-label="Sửa"><Icon name="pen-line" size={15} /></button>
                      <button type="button" className="mo-iconbtn" onClick={() => onToggleDisabled(o)} title={o.disabled ? "Mở khoá" : "Khoá"} aria-label={o.disabled ? "Mở khoá" : "Khoá"}><Icon name={o.disabled ? "eye" : "eye-off"} size={15} /></button>
                      <button type="button" className="mo-iconbtn" onClick={() => onDelete(o)} title="Xoá" aria-label="Xoá"><Icon name="x" size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {form && (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setForm(null)}>
          <div style={{ background: "var(--card)", borderRadius: 12, padding: 20, width: "min(440px, 92vw)", display: "flex", flexDirection: "column", gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontWeight: 700, fontSize: 18 }}>{form.id ? "Sửa tài khoản" : "Thêm tài khoản"}</h2>
            {!form.id && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>Tên đăng nhập
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mo-input" autoComplete="off" />
              </label>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>Tên hiển thị
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mo-input" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>{form.id ? "Đặt lại mật khẩu (để trống nếu giữ nguyên)" : "Mật khẩu"}
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mo-input" autoComplete="new-password" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>Quyền
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mo-input">
                <option value="operator">operator</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setForm(null)}>Huỷ</Button>
              <Button onClick={submit} disabled={isPending || (!form.id && (!form.username || !form.password)) || !form.name}>{isPending ? "Đang lưu…" : "Lưu"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
