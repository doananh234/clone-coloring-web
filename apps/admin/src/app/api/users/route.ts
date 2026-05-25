import { NextRequest, NextResponse } from "next/server";
import { mockUsers } from "@/mocks/users";

let users = [...mockUsers];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "20");

  let filtered = [...users];

  const filtersParam = searchParams.get("filters");
  if (filtersParam) {
    try {
      const filters = JSON.parse(filtersParam) as Record<string, string>;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        filtered = filtered.filter(
          (u) => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search),
        );
      }
      if (filters.role) {
        filtered = filtered.filter((u) => u.role === filters.role);
      }
    } catch {}
  }

  const sortParam = searchParams.get("sort");
  if (sortParam) {
    try {
      const sorts = JSON.parse(sortParam) as {
        field: string;
        order: string;
      }[];
      if (sorts.length > 0) {
        const { field, order } = sorts[0];
        filtered.sort((a, b) => {
          const aVal = String((a as Record<string, unknown>)[field] ?? "");
          const bVal = String((b as Record<string, unknown>)[field] ?? "");
          return order === "desc" ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
        });
      }
    } catch {}
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const paged = filtered.slice(start, start + limit);

  return NextResponse.json({
    data: paged,
    meta: { total, page, limit, totalPages },
  });
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const newUser = {
    id: String(Date.now()),
    name: String(data.name || ""),
    email: String(data.email || ""),
    role: String(data.role || "user"),
  };
  users.push(newUser);
  return NextResponse.json(newUser, { status: 201 });
}
