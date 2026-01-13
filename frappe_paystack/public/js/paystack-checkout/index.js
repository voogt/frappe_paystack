const isEmail = str => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);

const { createApp } = Vue

createApp({
  delimiters: ['[%', '%]'],
  data() {
    return {
        id: '',
        payment_data: {},
        gateway: '',
        showDiv: false,
        doc: window.doc,
    }
  },
  methods: {
    payWithPaystack(){
        let me = this;
        let handler = PaystackPop.setup({
            key: doc.public_key, 
            amount: doc.payment_amount * 100,
            // ref: me.payment_data.name+'_'+Math.floor((Math.random() * 1000000000) + 1), // generates a pseudo-unique reference. Please replace with a reference you generated. Or remove the line entirely so our API will generate one for you
            currency: doc.currency,
            email: doc.email,
            metadata: {
                reference_doctype:doc.reference_doctype,
                reference_docname:doc.reference_docname,
                customer:doc.customer,
                reference:doc.reference,
                email: doc.email
            },
            // label: "Optional string that replaces customer email"
            onClose: function(){
                alert('Payment Terminated.');
            },
            callback: function(response){
                frappe.call({
                    type: "POST",
                    method: "frappe_paystack.api.fecthCustomerAndItemDetails",
                    args:{customer_name: doc.customer, sales_order: doc.reference_docname}
                }).then(res => {
                    if(res.message.auto_enroll){
                        frappe.call({
                        method: 'frappe_paystack.api.register_and_enrol_moodle_user',
                        args: {
                            first_name: res.message.customer.first_name,
                            last_name: res.message.customer.last_name,
                            email: doc.email,
                            course_items: res.message.items
                        }
                        }).then(r => {
                            Swal.fire({
                                title: "Enrolment Successful",
                                text: "Please use email " + doc.email + " to login into https://training.kartoza.com/my/courses.php.",
                                icon: "success"
                            })
                        }).catch(err => {
                            try {
                                Swal.fire({
                                    title: "Enrolment Failed",
                                    text: (err && err.message) || "An error occurred while enrolling.",
                                    icon: "error"
                                })
                            } catch (_) {}
                        })
                    }
                    else{
                        Swal.fire(
                            'Successful',
                            'Your payment was successful, we will issue you receipt shortly.',
                            'success'
                        )
                    }
                }).catch(err => {
                    
                });
                $('#paymentBTN').hide();
            }
        });

        handler.openIframe();
    },
    getData(){
        let me = this;
        frappe.call("frappe_paystack.api.validate_payment_link", {"docname": doc.reference}).then(res=>{
            let data = res.message;
            if (data.order_status in ["Completed", "Closed'", "Paid"]) {
                errors = "Paid or Completed"
            } else if (["Processed", "Completed"].includes(data.status)){
                errors = "Payment already processed."
            } else if ([0, 2].includes(data.order_docstatus)) {
                errors = "Payment link expired or invalid."
            } else {
                errors = ""
            }
            if (errors){
                window.location.reload();
            } else {
                if (doc.email){
                    this.payWithPaystack();
                } else {

                    Swal.fire({
                        title: "Your email",
                        input: "text",
                        inputAttributes: {
                            autocapitalize: "off"
                        },
                        showCancelButton: false,
                        confirmButtonText: "Continue",
                        showLoaderOnConfirm: true,
                        allowOutsideClick: () => !Swal.isLoading()
                    }).then((value) => {
                        if (value.isConfirmed) {
                            if (isEmail(value.value)){
                                doc.email = value.value;
                                me.payWithPaystack();
                            } else {
                                Swal.fire({
                                    title: "Invalid Email",
                                    text: "Retry",
                                    icon: "warning"
                                });
                            }
                        }
                        
                    });
                }
            }
        })
    },
    formatCurrency(amount, currency){
        if(currency){
            return Intl.NumberFormat('en-US', {currency:currency, style:'currency'}).format(amount);
        } else {
            return Intl.NumberFormat('en-US').format(amount);
        }
    }
  },
  mounted(){

  }
}).mount('#app')



document.querySelector("paymentBTN")