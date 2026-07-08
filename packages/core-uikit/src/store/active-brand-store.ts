import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ActiveBrand = { id: string; name: string };

type ActiveBrandState = {
  activeBrand: ActiveBrand | null;
  setActiveBrand: (brand: ActiveBrand | null) => void;
};

export const useActiveBrandStore = create<ActiveBrandState>()(
  persist(
    (set) => ({
      activeBrand: null,
      setActiveBrand: (brand) => set({ activeBrand: brand }),
    }),
    { name: "vx_active_brand" }
  )
);
