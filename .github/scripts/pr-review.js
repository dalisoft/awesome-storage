// @ts-check
/**
 * Posts one PR review based on the results of the previous CI jobs:
 * APPROVE ("LGTM!") when everything is green, REQUEST_CHANGES otherwise.
 *
 * Job results come in through env (needs.<job>.result):
 * LINT_RESULT, SIGNED_RESULT, SPAM_RESULT - success | failure | cancelled | skipped
 *
 * @param {import('@actions/github-script').AsyncFunctionArguments} AsyncFunctionArguments
 */
export default async function prReview({ github, core, context }) {
  const pr = context.payload.pull_request;
  if (!pr) {
    throw new Error(
      "The workflow was configured incorrectly. Please check workflow"
    );
  }

  const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const env = process.env;

  // Spam Guard is skipped for the maintainer and dependabot, which is fine
  const checks = [
    { name: "PR Lint", result: env.LINT_RESULT, okSkipped: false },
    { name: "Signed Commits", result: env.SIGNED_RESULT, okSkipped: false },
    { name: "PR Spam Guard", result: env.SPAM_RESULT, okSkipped: true },
  ].map((check) => ({
    ...check,
    ok:
      check.result === "success" ||
      (check.okSkipped && check.result === "skipped"),
  }));

  const allOk = checks.every((check) => check.ok);
  const event = allOk ? "APPROVE" : "REQUEST_CHANGES";
  const state = allOk ? "APPROVED" : "CHANGES_REQUESTED";

  const lines = checks.map(
    (check) =>
      `- ${check.ok ? "✅" : "❌"} **${check.name}**: \`${check.result}\``
  );
  const body = [
    allOk ? `LGTM! 🎉` : `### ❌ Changes requested`,
    ``,
    ...lines,
    ``,
    allOk
      ? `All required checks passed.`
      : `Please fix the failing checks above and push again. Details: [workflow run](${runUrl}). See [CONTRIBUTING.md](${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/blob/master/CONTRIBUTING.md).`,
  ].join("\n");

  // Do not repeat the same verdict on the same commit (e.g. re-runs)
  const reviews = await github.paginate(github.rest.pulls.listReviews, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: pr.number,
    per_page: 100,
  });
  const lastOwn = reviews
    .filter((review) => review.user?.login === "github-actions[bot]")
    .filter((review) => review.state !== "COMMENTED")
    .at(-1);
  if (lastOwn?.state === state && lastOwn.commit_id === pr.head.sha) {
    core.info(`Already ${state} on ${pr.head.sha}; skipping review.`);
  } else {
    await github.rest.pulls.createReview({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: pr.number,
      commit_id: pr.head.sha,
      event,
      body,
    });
  }

  await core.summary.addRaw(body, true).write();
  core.setOutput("approved", String(allOk));
}
