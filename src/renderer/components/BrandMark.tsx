import React from "react";
import { cn } from "../lib/utils";

type Props = {
  className?: string;
};

const BrandMark: React.FC<Props> = ({ className }) => {
  return (
    <span className={cn("brand-mark", className)} aria-hidden="true">
      <svg viewBox="0 0 180 180" fill="none" role="img">
        <path
          d="M92 164C118 152 144 132 152 106C156 92 154 80 140 60C146 52 154 42 142 36C134 32 128 38 120 28C112 20 104 18 92 20C80 18 72 20 64 28C56 38 50 32 42 36C30 42 38 52 44 60C30 80 28 92 32 106C40 132 66 152 92 164Z"
          className="brand-mark__shell"
        />
        <path
          d="M87.554 48.069C76.644 68.525 61.643 82.162 60.279 103.98C58.915 127.846 78.008 142.165 91.645 151.711C94.372 139.437 102.555 127.164 113.465 114.89C124.374 102.617 129.829 87.616 121.647 69.888C114.828 54.887 101.191 43.977 87.554 48.069Z"
          className="brand-mark__flame"
        />
        <path
          d="M95.736 80.798C102.555 84.888 106.646 94.434 99.827 105.344C94.372 114.209 83.462 120.345 79.371 124.436C82.099 110.799 86.19 102.617 95.736 94.434C102.555 87.616 95.736 80.798 95.736 80.798Z"
          className="brand-mark__core"
        />
      </svg>
    </span>
  );
};

export default BrandMark;
