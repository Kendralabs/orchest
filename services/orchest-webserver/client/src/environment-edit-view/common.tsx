import { CustomImage, Language } from "@/types";

export const LANGUAGE_MAP: Record<Language, string> = {
  python: "Python",
  r: "R",
  julia: "Julia",
};

// Related to the analytics.py module, "environment_build_start" event,
// which checks for the base image to start with "orchest/".
export const DEFAULT_BASE_IMAGES: (CustomImage & { img_src: string })[] = [
  {
    base_image: "orchest/base-kernel-py",
    img_src: "/image/python_logo.png",
    language: "python",
    gpu_support: false,
  },
  {
    base_image: "orchest/base-kernel-py-gpu",
    img_src: "/image/python_logo.png",
    language: "python",
    gpu_support: true,
  },
  {
    base_image: "orchest/base-kernel-r",
    img_src: "/image/r_logo.svg",
    language: "r",
    gpu_support: false,
  },
  {
    base_image: "orchest/base-kernel-julia",
    img_src: "/image/julia_logo.svg",
    language: "julia",
    gpu_support: false,
  },
];
