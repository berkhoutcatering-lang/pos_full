package nl.hopbites.posbridge

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.mypos.smartsdk.Currency
import com.mypos.smartsdk.MyPOSAPI
import com.mypos.smartsdk.MyPOSPayment
import com.mypos.smartsdk.MyPOSUtil
import com.mypos.smartsdk.TransactionProcessingResult

/**
 * Invisible activity whose only job is to host a myPOS payment.
 *
 * The Smart SDK delivers its outcome through onActivityResult, so a payment has
 * to be started from an Activity — a Service cannot receive the result. This one
 * is translucent and finishes as soon as the terminal is done, so staff only
 * ever see the myPOS payment screen on top of the kassa.
 */
class PaymentActivity : Activity() {

    companion object {
        const val EXTRA_KEY = "idempotency_key"
        const val EXTRA_AMOUNT_CENTS = "amount_cents"
        const val EXTRA_REFERENCE = "reference"
        private const val REQUEST_PAYMENT = 4711
        private const val TAG = "PaymentActivity"
    }

    private lateinit var idempotencyKey: String

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        idempotencyKey = intent.getStringExtra(EXTRA_KEY).orEmpty()
        val amountCents = intent.getIntExtra(EXTRA_AMOUNT_CENTS, 0)
        val reference = intent.getStringExtra(EXTRA_REFERENCE).orEmpty()

        if (idempotencyKey.isEmpty() || amountCents <= 0) {
            Log.e(TAG, "Refusing payment: key='$idempotencyKey' amount=$amountCents")
            PaymentStore.complete(idempotencyKey, PaymentStore.Status.FAILED, null, "invalid_request")
            finish()
            return
        }

        // Recreated after a config change or process death — do not start a
        // second payment for the same key.
        if (savedInstanceState != null) return

        try {
            val payment = MyPOSPayment.builder()
                .productAmount(amountCents / 100.0)
                .currency(Currency.EUR)
                // Our idempotency key doubles as myPOS' foreign transaction id,
                // so the two systems can be reconciled afterwards.
                .foreignTransactionId(idempotencyKey)
                .reference(reference.take(50), com.mypos.smartsdk.ReferenceType.REFERENCE_NUMBER)
                // The kassa prints its own receipts on the kitchen printer.
                .printMerchantReceipt(MyPOSUtil.RECEIPT_OFF)
                .printCustomerReceipt(MyPOSUtil.RECEIPT_OFF)
                .build()

            MyPOSAPI.openPaymentActivity(this, payment, REQUEST_PAYMENT)
        } catch (e: Exception) {
            Log.e(TAG, "Could not start payment", e)
            PaymentStore.complete(idempotencyKey, PaymentStore.Status.FAILED, null, e.message)
            finish()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_PAYMENT) return

        if (resultCode != RESULT_OK || data == null) {
            // The customer or the operator backed out before paying.
            PaymentStore.complete(idempotencyKey, PaymentStore.Status.DECLINED, null, "cancelled")
            finish()
            return
        }

        val code = data.getIntExtra("status", TransactionProcessingResult.TRANSACTION_FAILED)
        val approved = data.getBooleanExtra("transaction_approved", false)

        // Both signals must agree before we call it paid. Treating "processed"
        // as "approved" is how a declined card ends up booked as revenue.
        val status = if (approved && code == TransactionProcessingResult.TRANSACTION_SUCCESS) {
            PaymentStore.Status.APPROVED
        } else {
            PaymentStore.Status.DECLINED
        }

        Log.i(TAG, "Payment $idempotencyKey -> $status (code=$code approved=$approved)")
        PaymentStore.complete(idempotencyKey, status, code, null)
        finish()
    }
}
