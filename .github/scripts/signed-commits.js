// @ts-check
/** @param {import('@actions/github-script').AsyncFunctionArguments} AsyncFunctionArguments */
export default async function signedCommits({ github, core, context }) {
  if (!context?.payload?.pull_request) {
    throw new Error(
      "The workflow was configured incorrectly. Please check workflow"
    );
  }

  const commits = await github.paginate(github.rest.pulls.listCommits, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request.number,
    per_page: 100,
  });

  const unverified = commits.filter(
    (commit) => !commit.commit.verification?.verified
  );

  const rows = commits.map((commit) => {
    const verification = commit.commit.verification;
    const status = verification?.verified ? "✅ Verified" : "❌ Unverified";
    const reason = verification?.reason ?? "unknown";
    const subject = commit.commit.message.split("\n")[0].replace(/\|/g, "\\|");
    return `| \`${commit.sha.slice(0, 7)}\` | ${subject} | ${status} | \`${reason}\` |`;
  });

  const body = [
    `### 🔏 Signed commits report`,
    ``,
    `| Commit | Message | Status | Reason |`,
    `|---|---|---|---|`,
    ...rows,
    ``,
    unverified.length === 0
      ? `✅ All ${commits.length} commit(s) are signed and verified.`
      : `❌ ${unverified.length} of ${commits.length} commit(s) are not signed or not verified. See [CONTRIBUTING.md](https://github.com/${context.repo.owner}/${context.repo.repo}/blob/master/CONTRIBUTING.md#signed-commits) for how to sign them.`,
  ].join("\n");

  await core.summary.addRaw(body, true).write();
  core.setOutput("verified", String(unverified.length === 0));

  if (unverified.length > 0) {
    core.setFailed(
      `Unsigned or unverified commits: ${unverified
        .map((commit) => commit.sha.slice(0, 7))
        .join(", ")}. All commits must be signed (see CONTRIBUTING.md).`
    );
  }
}
