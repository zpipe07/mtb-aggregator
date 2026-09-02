import type { Meta, StoryObj } from "@storybook/react";
import { GiveawayCard } from "./GiveawayCard";
import type { Giveaway } from "@/api";

const openGiveaway: Giveaway = {
  id: 1,
  slug: "norco-whistler-rampage",
  kind: "giveaway",
  title: "Win a custom Norco Rampage",
  summary:
    "Norco and Bicycle Nightmares are giving away a one-of-one custom Rampage painted in Whistler.",
  prize_name: "Custom Norco Rampage",
  host_name: "Norco",
  entry_url: "https://www.norco.com/whistler-contest/",
  official_rules_url: "https://www.norco.com/whistler-contest/#rules",
  ends_at: "2026-09-15T23:59:59Z",
  eligibility: "US & Canada, 18+",
  entry_requirements: "Form + follow @norcobicycles",
  ticket_currency: "USD",
  status: "open",
};

const raffle: Giveaway = {
  ...openGiveaway,
  id: 2,
  slug: "trail-org-bike-raffle",
  kind: "raffle",
  title: "Trail alliance bike raffle",
  summary: "Buy a ticket, fund local trails, maybe take home a trail bike.",
  prize_name: "Trail bike build",
  host_name: "Local trail alliance",
  entry_url: "https://example.com/raffle",
  official_rules_url: "https://example.com/raffle-rules",
  ticket_price: 10,
  ticket_currency: "USD",
  beneficiary: "Local trail alliance",
  status: "open",
};

const ended: Giveaway = {
  ...openGiveaway,
  id: 3,
  slug: "muc-off-specialized",
  title: "Win a Muc-Off painted Specialized",
  ends_at: "2020-01-01T00:00:00Z",
  status: "ended",
};

const upcoming: Giveaway = {
  ...openGiveaway,
  id: 4,
  slug: "pinkbike-aggy",
  title: "Win Aggy's Kamloops freeride rig",
  starts_at: "2027-01-01T00:00:00Z",
  ends_at: "2027-02-01T00:00:00Z",
  status: "upcoming",
};

const meta = {
  title: "Components/GiveawayCard",
  component: GiveawayCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof GiveawayCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OpenGiveaway: Story = {
  args: { giveaway: openGiveaway },
};

export const OpenRaffle: Story = {
  args: { giveaway: raffle },
};

export const Ended: Story = {
  args: { giveaway: ended },
};

export const Upcoming: Story = {
  args: { giveaway: upcoming },
};

export const CompactHome: Story = {
  args: { giveaway: openGiveaway, compact: true, surface: "home" },
};
