// 404 page for unknown routes inside the React app.
import { ButtonLink, Card, EmptyState } from "../components/ui";

export default function NotFound() {
  return (
    <Card>
      <EmptyState title="Page not found" action={<ButtonLink to="/markets">Go to Markets</ButtonLink>}>
        The page you're looking for doesn't exist or has moved.
      </EmptyState>
    </Card>
  );
}
