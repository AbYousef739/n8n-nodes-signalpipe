# n8n-nodes-signalpipe

This is an n8n community node. It lets you use [SignalPipe](https://signalpipe.io) in your n8n workflows.

SignalPipe decides whether the author of a post, message or email is a real buyer for your product, and calls in a panel of three AI judges when the text is not clear-cut. When SignalPipe reads the communities you choose, each buyer the judges keep becomes a **mission**: the post, its author and a drafted reply for you to approve. Nothing is posted or sent without a person.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is `n8n-nodes-signalpipe`.

Self-hosted n8n can install it from **Settings > Community Nodes**. n8n Cloud installs only community nodes that n8n has verified.

## Operations

### SignalPipe

**Signal**

- **Score**: judge whether the author of a text is a real buyer for one of your products. Optional fields:
  - **Context**: the post or thread the text replies to.
  - **Source**: where the text came from (for example `gmail` or `slack`), which sets the tone of the suggested reply.
  - **Simplify** (on by default): return only the fields most workflows branch on. Turn it off to get everything, including the drafting context.

**Mission**

- **Get Many**: the open missions (waiting for approval, needing a draft, or approved). Filter by status, product or minimum score; sort newest first or by how much the judges agreed; optionally include what a writer needs to draft a reply.
- **Approve**: approve the drafted reply, optionally with your edited wording. SignalPipe posts nothing; approving also tells the judges the lead was a good one.
- **Reject**: reject a mission that was not a real buyer. The reason you pick (spam, not relevant, wrong product and so on) teaches the judges.
- **Mark as Sent**: record that you posted the reply yourself, so SignalPipe follows the conversation from there.
- **Upload Draft**: attach a reply you wrote. The mission then waits for your approval.
- **Delete**: remove a mission without teaching the judges anything, for example when the post was deleted.

**Product**

- **Get Many**: the products your buyers are judged against.

The SignalPipe node can also be used as a tool by n8n's AI Agent.

### SignalPipe Trigger

- **New Mission**: starts the workflow when SignalPipe finds a new buyer. Filters: product, minimum score, and **Only With a Draft**, which waits until a mission has a drafted reply.

The trigger checks on the schedule you set. When you activate the workflow, missions already in the queue are skipped; only missions found after that start it. A test run returns the newest matching mission so you can map its fields.

## Credentials

You need a SignalPipe account with an active plan ([pricing](https://signalpipe.io/pricing)).

1. On your [SignalPipe dashboard](https://signalpipe.io/dashboard), create an operator key. The key is shown once; creating a new one replaces the old one.
2. In n8n, open **Credentials**, choose **New**, pick **SignalPipe API** and paste the key into **Operator Key**.
3. Save. n8n checks the key by listing your products.

A key only works while your plan is active.

## Compatibility

Built with n8n's node CLI (`@n8n/node-cli` 0.49) against `n8n-workflow` 2.40, and runs on n8n 2.40.

## Usage

### Reading a Score result

With **Simplify** on, the node returns `score`, `classification`, `panel_verdict`, `degraded`, `swarm_skipped`, `role` and `competitor_name`. With it off, you get every field below.

| Field | Meaning |
| --- | --- |
| `classification` | `buying_intent`, `borderline`, `competitor_mention` or `noise` |
| `score` | 0 to 100 |
| `panel_verdict` | `kept`, `rejected` (the judges said no), or `not_run` (the text was clear-cut on its own; see `swarm_skipped`) |
| `degraded` | `true` when the judges should have run but did not, for example because the month's judgements are used up. Treat these verdicts with care |
| `role` | the stance a reply should take: `closer`, `advisor` or `educator` |
| `competitor_match`, `competitor_name`, `competitor_intent` | whether the author mentions one of your competitors, and how |
| `swarm` | each judge's stance in a word, and whether they split |
| `drafting_context` | present when the score is 40 or more: what a writer, or an AI node, needs to draft a reply |
| `plan`, `quota_month`, `quota_used_month` | your plan and this month's judgements |

A simple rule for an **If** node: continue when `classification` is `buying_intent` or `competitor_mention` and `panel_verdict` is not `rejected`.

A Score call uses one of your plan's judgements only when the three judges convene. Text that is clear-cut on its own is decided without them.

### Example workflows

- **Triage your inbox.** Gmail Trigger → SignalPipe *Score* (Text: the email body, Source: `gmail`) → If (the rule above) → create a deal in your CRM, or post to a sales channel.
- **Approve replies from Slack.** SignalPipe Trigger (*Only With a Draft*) → Slack message with the post, its link and the draft → after you approve, SignalPipe *Approve* and, once you have posted it, *Mark as Sent*.
- **Draft with your own model.** SignalPipe *Get Many* (Status: Needs a Draft, *Include Drafting Context*) → an AI node writes the reply from `draft_context` → SignalPipe *Upload Draft*.

### Data

The node sends the text you score, and any context, to SignalPipe at `api.signalpipe.io`. See SignalPipe's [privacy policy](https://signalpipe.io/privacy) for how it is processed.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [SignalPipe guide](https://signalpipe.io/guide)
- [SignalPipe API reference](https://signalpipe.io/api)

## Version history

- **0.1.0**: first release. Score, missions (get, approve, reject, mark as sent, upload a draft, delete), products, and the New Mission trigger.
