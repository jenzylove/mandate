import { redirect } from "next/navigation";

// Builders are routed to BNB Agent Studio; this product does not rebuild it.
export default function BuildAgent() {
  redirect("https://www.bnbchain.org/en/agent-studio");
}
