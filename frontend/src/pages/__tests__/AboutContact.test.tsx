// About (owner, FAQ, no fake content) and Contact (validation, prefill, send, API error).
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import About, { FAQ } from "../About";
import Contact from "../Contact";
import { errorResponse, mockApi, renderPage, signIn, signOut } from "../../test/utils";

describe("About", () => {
  it("credits the owner, links GitHub/LinkedIn and has the 5-question FAQ", () => {
    renderPage(<About />);
    expect(screen.getByText("Sumit Parmar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /github/i })).toHaveAttribute("href", "https://github.com/sumitparmar19");
    expect(FAQ).toHaveLength(5);
    FAQ.forEach(([q]) => expect(screen.getByText(q)).toBeInTheDocument());
    expect(document.body.textContent).not.toMatch(/million clients|leading stock broker|testimonial/i);
  });
});

describe("Contact", () => {
  beforeEach(() => signOut());

  it("validates before sending", async () => {
    const { calls } = mockApi({});
    renderPage(<Contact />);
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/name, email and a message/i);
    expect(calls).toHaveLength(0);
  });

  it("pre-fills a logged-in user and sends the message", async () => {
    signIn("Asha K");
    const { calls } = mockApi({ "POST /api/contact": { success: true, emailed: true } });
    renderPage(<Contact />);
    expect(screen.getByLabelText(/your name/i)).toHaveValue("Asha K");
    await userEvent.type(screen.getByLabelText(/message/i), "Found a bug on Markets");
    await userEvent.selectOptions(screen.getByLabelText(/topic/i), "Bug report");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByText(/message received/i)).toBeInTheDocument();
    await waitFor(() => expect(calls[0].body).toEqual({ name: "Asha K", email: "s@x.com", subject: "Bug report", message: "Found a bug on Markets" }));
  });

  it("shows the rate-limit error from the API", async () => {
    mockApi({ "POST /api/contact": errorResponse(429, "Too many messages from this connection. Please try again in an hour.") });
    renderPage(<Contact />);
    await userEvent.type(screen.getByLabelText(/your name/i), "V");
    await userEvent.type(screen.getByLabelText(/your email/i), "v@x.com");
    await userEvent.type(screen.getByLabelText(/message/i), "hi");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many messages/i);
  });
});
