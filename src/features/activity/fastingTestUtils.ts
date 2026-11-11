/**
 * Delat av fastetesterna (inte av appkoden): ord som aldrig får stå i en fastetext – inga hälso- eller
 * viktlöften och inget beröm eller poängsystem (CLAUDE.md "Ton": fasta firas aldrig).
 */
export const BANNED_FASTING_WORDS = /bränn|autofagi|detox|insulinkänslighet|snabb(are)? viktnedgång|ämnesomsättning|bra jobbat|snyggt|grattis|streak/i
