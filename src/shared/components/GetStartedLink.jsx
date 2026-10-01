import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { rememberPlanIntent } from "../config/planIntent";

/**
 * The one "start using HR Clouds" link, used by every marketing CTA.
 *
 * Where it goes depends on how far along the visitor already is:
 *   - signed out  → /auth/register, because /register-organization refuses
 *                   anyone without a token and bounces them to login
 *   - signed in   → /register-organization, the plan picker itself
 *
 * Marketing CTAs used to point at /auth/login instead, which asked buyers with
 * no account to sign in to one.
 *
 * `plan` and `billing` are optional. When given, the choice is parked in
 * sessionStorage so it survives the signup detour and pre-selects itself in
 * the picker on the other side.
 */
function GetStartedLink({ plan, billing = "monthly", className, children, onNavigate }) {
  const { isAuthenticated } = useAuth();

  const to = isAuthenticated
    ? `/register-organization${plan ? `?plan=${plan}&billing=${billing}` : ""}`
    : "/auth/register";

  const handleClick = () => {
    if (plan) rememberPlanIntent(plan, billing);
    onNavigate?.();
  };

  return (
    <Link to={to} onClick={handleClick} className={className}>
      {children}
    </Link>
  );
}

export default GetStartedLink;
