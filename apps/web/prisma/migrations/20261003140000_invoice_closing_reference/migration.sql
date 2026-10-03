-- The default invoice closing now names the invoice number as the payment
-- reference. The org form used to store the default it was prefilled with, so
-- an org that never wrote its own text holds a copy of the old one.
UPDATE "Organization"
SET "invoiceClosingTemplate" = NULL
WHERE "invoiceClosingTemplate" = 'Bitte überweisen Sie den Gesamtbetrag innerhalb von {paymentTermsDays} Tagen auf das unten angegebene Konto.';

-- Same for the other three presets, which are unchanged: a stored copy of the
-- default would stop following it.
UPDATE "Organization"
SET "offerIntroTemplate" = NULL
WHERE "offerIntroTemplate" = 'Gerne bieten wir Ihnen für die Produktion „{production}“ im Zeitraum {servicePeriod} die folgenden Leistungen an.';

UPDATE "Organization"
SET "offerClosingTemplate" = NULL
WHERE "offerClosingTemplate" = 'Wir freuen uns auf Ihre Rückmeldung und stehen für Fragen gerne zur Verfügung.';

UPDATE "Organization"
SET "invoiceIntroTemplate" = NULL
WHERE "invoiceIntroTemplate" = 'Wie vereinbart, stellen wir Ihnen die folgenden Leistungen für die Produktion „{production}“ in Rechnung.';

-- Draft invoices still carrying the old default, untouched, get the new one.
-- A finalized invoice is its archived PDF and stays as it is.
UPDATE "Invoice"
SET "closingText" = 'Bitte überweisen Sie den Gesamtbetrag innerhalb von ' || "paymentTermsDays" || ' Tagen unter Angabe des Verwendungszwecks „' || "number" || '“ auf das unten angegebene Konto.'
WHERE "sentAt" IS NULL
  AND "pdfPath" IS NULL
  AND "closingText" = 'Bitte überweisen Sie den Gesamtbetrag innerhalb von ' || "paymentTermsDays" || ' Tagen auf das unten angegebene Konto.';
