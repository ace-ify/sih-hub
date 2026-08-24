/**
 * Renders the rebuilt description blocks. Each block is either a plain
 * paragraph or a "Heading: text" section whose extra lines are enumerated
 * items — the scraper reconstructs that shape, this just styles it.
 */
export function Description({ blocks, fallback }: { blocks: string[]; fallback: string }) {
  const list = blocks?.length ? blocks : [fallback];

  return (
    <div className="space-y-5 text-[0.95rem] leading-relaxed">
      {list.map((block, i) => {
        const [first, ...rest] = block.split("\n");
        const heading = /^([A-Z][A-Za-z /&]{2,40}):\s*/.exec(first);

        return (
          <section key={i}>
            {heading ? (
              <>
                <h3 className="mb-1 font-medium text-foreground">{heading[1]}</h3>
                <p>{first.slice(heading[0].length)}</p>
              </>
            ) : (
              <p>{first}</p>
            )}
            {rest.length > 0 && (
              <ul className="mt-2 space-y-1 pl-1">
                {rest.map((line, j) => (
                  <li key={j} className="flex gap-2">
                    <span aria-hidden className="select-none text-muted-foreground">
                      –
                    </span>
                    <span>{line.replace(/^[•▪●·]\s*/, "")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
