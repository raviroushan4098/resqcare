import { screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { renderWithIntl } from "@/test/render";
import { EmergencyBar } from "./EmergencyBar";

describe("EmergencyBar", () => {
  it("renders tel: links for 112, 108 and 102", () => {
    renderWithIntl(<EmergencyBar />);
    expect(screen.getByRole("link", { name: "Call emergency services 112" })).toHaveAttribute("href", "tel:112");
    expect(screen.getByRole("link", { name: "Call ambulance 108" })).toHaveAttribute("href", "tel:108");
    expect(screen.getByRole("link", { name: "Call ambulance 102" })).toHaveAttribute("href", "tel:102");
  });

  it("is a labelled navigation landmark with 112 first in tab order", () => {
    renderWithIntl(<EmergencyBar />);
    const nav = screen.getByRole("navigation", { name: "Emergency numbers" });
    const links = within(nav).getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "tel:112");
  });

  it("stays above dialog overlays and accepts pointer events", () => {
    renderWithIntl(<EmergencyBar />);
    const nav = screen.getByRole("navigation", { name: "Emergency numbers" });
    expect(nav.className).toContain("z-[60]");
    expect(nav.className).toContain("pointer-events-auto");
  });

  it("renders in Hindi", () => {
    renderWithIntl(<EmergencyBar />, { locale: "hi" });
    expect(screen.getByRole("link", { name: "आपातकालीन सेवाओं को 112 पर कॉल करें" })).toHaveAttribute("href", "tel:112");
    expect(screen.getByText("112 पर कॉल करें")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderWithIntl(<EmergencyBar />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
