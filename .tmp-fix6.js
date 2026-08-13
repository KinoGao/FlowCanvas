const fs = require("fs");
const p = "web/src/app/(user)/canvas/components/script-desk-studio.tsx";
let s = fs.readFileSync(p, "utf8");
const LF = "\n";

const oldTbody = `<tbody>
                                {beats.map((beat, index) => {
                                    const state = outputStates[beat.id] || "idle";
                                    return (
                                        <Fragment key={beat.id}>`;
const newTbody = `<tbody>
                                {actGroups.map((group) => (
                                    <Fragment key={group.actTitle}>
                                        <tr style={{ background: theme.ui.controlFill }}>
                                            <td colSpan={7} className="px-3 py-1.5 font-semibold">
                                                <span className="opacity-80">{group.actTitle}</span>
                                                {group.act?.name ? <span className="ml-2 opacity-60">{group.act.name}</span> : null}
                                                {group.act?.duration ? <span className="ml-2 text-[11px] opacity-45">{group.act.duration}</span> : null}
                                                <span className="ml-2 text-[11px] opacity-45">{group.beats.length} 镜</span>
                                                {group.act?.summary ? <div className="mt-0.5 text-[11px] leading-4 opacity-45">{group.act.summary}</div> : null}
                                            </td>
                                        </tr>
                                        {group.beats.map(({ beat, index }) => {
                                            const state = outputStates[beat.id] || "idle";
                                            return (
                                                <Fragment key={beat.id}>`;
console.log("tbody open count:", s.split(oldTbody).length - 1);
if (s.split(oldTbody).length > 1) s = s.split(oldTbody).join(newTbody);

const oldClose = `                                        </Fragment>
                                    );
                                })}
                            </tbody>`;
const newClose = `                                        </Fragment>
                                            );
                                        })}
                                    </Fragment>
                                ))}
                            </tbody>`;
console.log("tbody close count:", s.split(oldClose).length - 1);
if (s.split(oldClose).length > 1) s = s.split(oldClose).join(newClose);

fs.writeFileSync(p, s);
console.log("done");
