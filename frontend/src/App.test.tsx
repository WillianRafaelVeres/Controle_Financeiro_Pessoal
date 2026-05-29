import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("renderiza o painel inicial", async () => {
    render(<App />);
    expect((await screen.findAllByText("Painel"))[0]).toBeInTheDocument();
    expect((await screen.findAllByText("Saldo livre para gastar"))[0]).toBeInTheDocument();
  });
});
