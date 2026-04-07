import * as React from "react";

import { cn } from "../../lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn("ui-input", className)} {...props} />;
}

export { Input };
