import * as React from "react";

import { cn } from "../../lib/utils";

function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("ui-card", className)} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("ui-card__header", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("ui-card__title", className)} {...props} />;
}

function CardDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("ui-card__description", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("ui-card__content", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("ui-card__footer", className)} {...props} />;
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
};
