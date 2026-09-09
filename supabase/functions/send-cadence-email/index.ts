import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

serve(async (req) => {
  // ✅ CORS preflight
  if (req?.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  try {
    const { to, subject, body, cadenceId } = await req?.json();

    if (!subject || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields: subject, body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const RESEND_API_KEY = (globalThis as any)?.Deno?.env?.get("RESEND_API_KEY") ?? (typeof (globalThis as any).Deno !== "undefined" ? (globalThis as any).Deno?.env?.get("RESEND_API_KEY") : undefined);
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Use provided recipient or fall back to default recipient
    const recipient = to || "jen@staytrvlr.com";

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: [recipient],
        subject: subject,
        html: body?.replace(/\n/g, "<br>"),
      }),
    });

    const emailData = await emailRes?.json();

    if (!emailRes?.ok) {
      return new Response(JSON.stringify({ error: emailData?.message || "Failed to send email", details: emailData }), {
        status: emailRes.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      messageId: emailData?.id,
      cadenceId: cadenceId || null,
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
