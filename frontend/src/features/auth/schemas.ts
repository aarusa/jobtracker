import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  remember_me: z.boolean().optional(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export const profileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    current_password: z.string().optional(),
    new_password: z.string().optional(),
    confirm_password: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const changingPassword = Boolean(values.new_password?.trim());
    if (!changingPassword) return;
    if (!values.current_password?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Current password is required",
        path: ["current_password"],
      });
    }
    if ((values.new_password?.length ?? 0) < 8) {
      ctx.addIssue({
        code: "custom",
        message: "Password must be at least 8 characters",
        path: ["new_password"],
      });
    }
    if (values.new_password !== values.confirm_password) {
      ctx.addIssue({
        code: "custom",
        message: "Passwords do not match",
        path: ["confirm_password"],
      });
    }
  });

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
export type ProfileFormValues = z.infer<typeof profileSchema>;
export type DeleteAccountFormValues = z.infer<typeof deleteAccountSchema>;
