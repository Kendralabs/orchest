import * as React from "react";
import { css, CSS } from "../core";

export const icon = css({ verticalAlign: "middle" });

export type IIconRef = SVGSVGElement;

export interface IIconProps extends React.SVGProps<IIconRef> {
  css?: CSS;
}

export interface ILightBulbProps extends IIconProps {}

export const IconLightBulb = React.forwardRef<IIconRef, IIconProps>(
  ({ css, className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      className={icon({ className, css })}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  )
);
