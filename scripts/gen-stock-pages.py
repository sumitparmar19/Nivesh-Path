# Generates the 12 stock pages (public/<TICKER>.html) from scripts/stock-page.template.html, so every
# stock page has the same layout. Edit the template, then run: python3 scripts/gen-stock-pages.py
import html, os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")
STOCKS = [
  ("AAPL", "Apple Inc.", "Apple", "NASDAQ", "img/Apple-Logo-PNG1.png"),
  ("NVDA", "NVIDIA Corporation", "NVIDIA", "NASDAQ", "img/nvidia.png"),
  ("TSLA", "Tesla, Inc.", "Tesla", "NASDAQ", "img/icons8-tesla-48.png"),
  ("MSFT", "Microsoft Corporation", "Microsoft", "NASDAQ", "img/microsoft-logo-png-2395.png"),
  ("AMZN", "Amazon.com, Inc.", "Amazon", "NASDAQ", "img/1688364728amazon-icon-black.png"),
  ("WMT", "Walmart Inc.", "Walmart", "NASDAQ", "img/Walmart-Logo-PNG-Image.png"),
  ("NKE", "NIKE, Inc.", "Nike", "NYSE", "img/pngimg.com - nike_PNG18.png"),
  ("UBER", "Uber Technologies, Inc.", "Uber", "NYSE", "img/1659777758uber-app-icon.png"),
  ("SBUX", "Starbucks Corporation", "Starbucks", "NASDAQ", "img/Starbucks-Logo-PNG4.png"),
  ("NFLX", "Netflix, Inc.", "Netflix", "NASDAQ", "img/pngimg.com - netflix_PNG10.png"),
  ("GS", "The Goldman Sachs Group, Inc.", "Goldman Sachs", "NYSE", "img/goldman-sachs-new-2022-seeklogo.svg"),
  ("ORCL", "Oracle Corporation", "Oracle", "NYSE", "img/image_processing20210620-25815-3aus89.png"),
]
T = open(os.path.join(HERE, "stock-page.template.html")).read()
for sym, name, short, exch, logo in STOCKS:
    page = (T.replace("{{SYM}}", sym).replace("{{NAME}}", html.escape(name)).replace("{{SHORT}}", html.escape(short))
             .replace("{{EXCH}}", exch).replace("{{LOGO}}", "/" + logo.replace(" ", "%20")))
    open(os.path.join(OUT, f"{sym}.html"), "w").write(page)
print("wrote", len(STOCKS))
