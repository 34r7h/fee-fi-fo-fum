# Demo video tools

SirKit wrote these scripts to record the submission video from the published dapp on Ethereum Sepolia. The video is 3:38 long, recorded in real time at 1920×1080, and has 13 shots. [docs/video-script.md](../../docs/video-script.md) lists the shots, their transactions and the voiceover.

`rec.mjs` drives Chrome through puppeteer. It records each shot as its own clip with the browser's screencast and gives the dapp a scripted test wallet through an injected EIP-1193 provider. The provider signs with a key that is kept outside the repo, under `~/.handoff/agents/SirKit/`, and every transaction it sends is a real Sepolia transaction at a 1.8 gwei maximum fee. Before each shot the script waits for the state the shot needs, such as a mined transaction, Etherscan's Logs tab, or fi's re-centre of the hen strategy, and it stops the take if that state does not arrive. Each shot is padded to the length of its narration line, and no footage is sped up.

`compose.mjs` joins the clips, puts the cover image in front, adds the narration, and burns in captions timed by length across each line's audio. It writes a captioned MP4, an MP4 without captions, the SRT file and the script with start times. The narration in `narration.json` was spoken with macOS `say` as a placeholder, and the operator records the final voiceover over the uncaptioned MP4.

`take5-manifest.json` and `take5-run.json` are the records of the take used in the video. Take 5 ran from 17:00 to 17:05 UTC on 26 September 2026 with the test wallet `0x2cFffC9DdCDE0419e8bB73695c16Bb8f7400a199`, which held only Sepolia ETH when it started. It sent five transactions and logged no console errors. Shot 9 (the re-centre) was recorded again at 17:10 UTC from the same wallet without sending anything, because the first recording showed the hen's quote from before the re-centre. Takes 1 to 4 stopped on recorder errors or showed a wrong state, and their transactions are listed in [WORKLOG.md](../../WORKLOG.md).

The scripts import puppeteer-core and viem from paths on the machine they ran on, so they document how the video was made and do not run elsewhere without editing those imports.
